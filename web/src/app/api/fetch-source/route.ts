import { NextResponse } from "next/server";
import { lookup as dnsLookup } from "node:dns";
import {
  isIP,
  type LookupFunction,
} from "node:net";
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type IncomingHttpHeaders,
} from "node:http";
import { request as httpsRequest } from "node:https";

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

class FetchSourceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type PageResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
};

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255,
    )
  ) {
    return false;
  }

  const [a, b, c] = parts;

  // Private, loopback, link-local, shared, documentation,
  // benchmarking, multicast, and other reserved address ranges.
  const blocked =
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);

  return !blocked;
}

function validateUrl(rawUrl: string): URL {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchSourceError(400, "Enter a valid public page URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchSourceError(400, "Only HTTP and HTTPS URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new FetchSourceError(400, "URLs containing credentials are not allowed.");
  }

  const expectedPort = url.protocol === "https:" ? "443" : "80";

  if (url.port && url.port !== expectedPort) {
    throw new FetchSourceError(
      400,
      "Only standard HTTP and HTTPS ports are allowed.",
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  // This initial implementation supports public IPv4 destinations only.
  // IPv6 literals and local/special-use hostnames are deliberately rejected.
  if (
    !hostname ||
    hostname.includes(":") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home.arpa") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".onion")
  ) {
    throw new FetchSourceError(400, "This hostname is not allowed.");
  }

  if (isIP(hostname) === 4) {
    if (!isPublicIPv4(hostname)) {
      throw new FetchSourceError(400, "Private or reserved IP addresses are blocked.");
    }
  } else if (!hostname.includes(".")) {
    throw new FetchSourceError(400, "A public domain name is required.");
  }

  return url;
}

// Check DNS results when the socket connects. This implementation intentionally
// restricts connections to public IPv4 addresses; IPv6-only websites won't work.
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    { all: true, family: 4 },
    (error, addresses) => {
      if (error) {
        callback(error, "", 4);
        return;
      }

      const validAddresses = addresses as Array<{ address: string; family: number }>;

      if (
        validAddresses.length === 0 ||
        validAddresses.some((item) => !isPublicIPv4(item.address))
      ) {
        const blockedError = Object.assign(
          new Error("Blocked non-public destination."),
          { code: "EACCES" },
        );

        callback(blockedError, "", 4);
        return;
      }

      const wantsAll =
        typeof options === "object" &&
        options !== null &&
        "all" in options &&
        options.all === true;

      if (wantsAll) {
        callback(null, validAddresses);
      } else {
        callback(null, validAddresses[0].address, 4);
      }
    },
  );
};

function requestOnce(target: URL): Promise<PageResponse> {
  return new Promise((resolve, reject) => {

    const onResponse = (incoming: IncomingMessage) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      incoming.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;

        if (totalBytes > MAX_RESPONSE_BYTES) {
          outgoing.destroy(
            new FetchSourceError(413, "The page response is too large."),
          );
          return;
        }

        chunks.push(buffer);
      });

      incoming.on("aborted", () => {
        reject(new FetchSourceError(502, "The remote page response was interrupted."));
      });

      incoming.on("error", (error) => reject(error));

      incoming.on("end", () => {
        resolve({
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    };

    const requestOptions = {
      method: "GET",
      headers: {
        "User-Agent": "FactTrail/0.1 (user-requested public page fetch)",
        Accept: "text/html, text/plain, application/xhtml+xml",
        "Accept-Encoding": "identity",
      },
      maxHeaderSize: 16 * 1024,
      lookup: safeLookup,
    };

const outgoing: ClientRequest =
      target.protocol === "https:"
        ? httpsRequest(target, requestOptions, onResponse)
        : httpRequest(target, requestOptions, onResponse);

    outgoing.setTimeout(TIMEOUT_MS, () => {
      outgoing.destroy(
        new FetchSourceError(504, "The page request timed out."),
      );
    });

    outgoing.on("error", (error) => reject(error));
    outgoing.end();
  });
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, digits: string) => {
      const codePoint = Number(digits);
      try {
        return codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      } catch {
        return match;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      try {
        return codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      } catch {
        return match;
      }
    });
}

function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1].replace(/<[^>]*>/g, " ")).trim().slice(0, 200)
    : "";

  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\b[^>]*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|main|header|footer)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}

async function fetchPublicPage(startUrl: string) {
  let currentUrl = validateUrl(startUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    // Revalidate every redirect destination; redirects are never followed
    // automatically by the HTTP client.
    currentUrl = validateUrl(currentUrl.href);

    const result = await requestOnce(currentUrl);
    const status = result.status;

    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = result.headers.location;

      if (typeof location !== "string" || !location) {
        throw new FetchSourceError(502, "The redirect did not provide a destination.");
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new FetchSourceError(502, "Too many redirects from the source page.");
      }

      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        throw new FetchSourceError(502, "The source returned an invalid redirect.");
      }

      continue;
    }

    if (status < 200 || status >= 300) {
      throw new FetchSourceError(
        502,
        `The source page returned HTTP ${status}.`,
      );
    }

    const header = result.headers["content-type"];
    const contentType =
      typeof header === "string" ? header.split(";")[0].trim().toLowerCase() : "";

    if (
      !["text/html", "text/plain", "application/xhtml+xml"].includes(contentType)
    ) {
      throw new FetchSourceError(
        415,
        "The source must return HTML, XHTML, or plain text.",
      );
    }

    const extracted =
      contentType === "text/plain"
        ? { title: currentUrl.hostname, text: result.body.trim() }
        : htmlToText(result.body);

    if (!extracted.text) {
      throw new FetchSourceError(422, "No readable text was found on this page.");
    }

    return {
      title: extracted.title || currentUrl.hostname,
      text: extracted.text.slice(0, MAX_TEXT_CHARS),
      contentType,
      fetchedAt: new Date().toISOString(),
      truncated: extracted.text.length > MAX_TEXT_CHARS,
    };
  }

  throw new FetchSourceError(502, "Could not fetch the source page.");
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send a valid JSON request body." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("url" in body) ||
    typeof body.url !== "string"
  ) {
    return NextResponse.json(
      { error: 'A URL field named "url" is required.' },
      { status: 400 },
    );
  }

  if (!body.url.trim() || body.url.length > 2048) {
    return NextResponse.json(
      { error: "The URL is empty or too long." },
      { status: 400 },
    );
  }

  try {
    const page = await fetchPublicPage(body.url.trim());
    return NextResponse.json(page);
  } catch (error: unknown) {
    if (error instanceof FetchSourceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error:
          "The page could not be fetched. It may be unavailable or blocked by network safety checks.",
      },
      { status: 502 },
    );
  }
}
