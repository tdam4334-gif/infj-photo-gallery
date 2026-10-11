/**
 * 心隅 · INFJ 照片收藏馆
 * Cloudflare Worker：静态站 + 共享上传 API（Workers KV）
 */

const MOODS = new Set(["quiet", "light", "rain", "night", "nature", "alone", "soft"]);
const MAX_UPLOAD = 8 * 1024 * 1024;
const INDEX_KEY = "meta/photos.json";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

async function readIndex(env) {
  try {
    const raw = await env.PHOTOS.get(INDEX_KEY, "text");
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeIndex(env, items) {
  await env.PHOTOS.put(INDEX_KEY, JSON.stringify(items.slice(0, 500)));
}

function detectType(file) {
  const name = (file.name || "").toLowerCase();
  const type = file.type || "";
  if (type === "image/jpeg" || type === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return { ext: ".jpg", mime: "image/jpeg" };
  }
  if (type === "image/png" || name.endsWith(".png")) return { ext: ".png", mime: "image/png" };
  if (type === "image/webp" || name.endsWith(".webp")) return { ext: ".webp", mime: "image/webp" };
  return null;
}

function safeText(value, limit = 80) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, limit);
}

async function handleUpload(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const ctype = request.headers.get("Content-Type") || "";
  if (!ctype.includes("multipart/form-data")) {
    return json({ ok: false, error: "需要 multipart/form-data" }, 400, origin);
  }

  const form = await request.formData();
  const photo = form.get("photo");
  if (!photo || typeof photo === "string") {
    return json({ ok: false, error: "没有收到照片" }, 400, origin);
  }

  const kind = detectType(photo);
  if (!kind) return json({ ok: false, error: "只支持 JPG、PNG、WebP" }, 400, origin);

  const buf = await photo.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.byteLength > MAX_UPLOAD) {
    return json({ ok: false, error: "文件超过 8MB" }, 413, origin);
  }
  if (bytes.byteLength < 64) {
    return json({ ok: false, error: "图片内容无效" }, 400, origin);
  }

  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  if ((kind.ext === ".jpg" && !isJpg) || (kind.ext === ".png" && !isPng) || (kind.ext === ".webp" && !isWebp)) {
    return json({ ok: false, error: "图片内容与格式不符" }, 400, origin);
  }

  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const key = `uploads/${id}${kind.ext}`;
  await env.PHOTOS.put(key, buf);

  const record = {
    id,
    src: `/api/file/${id}${kind.ext}`,
    caption: safeText(form.get("caption"), 80) || "未留下文字，但照片本身已经说了不少。",
    mood: MOODS.has(String(form.get("mood") || "")) ? String(form.get("mood")) : "quiet",
    author: safeText(form.get("author") || form.get("name"), 20) || "匿名 INFJ",
    createdAt: Date.now(),
    shared: true,
    mime: kind.mime,
  };

  const items = await readIndex(env);
  items.unshift(record);
  await writeIndex(env, items);

  return json({ ok: true, photo: record }, 200, origin);
}

async function serveFile(pathname, env) {
  const name = pathname.replace(/^\/api\/file\//, "");
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/i.test(name)) {
    return json({ ok: false, error: "非法路径" }, 400);
  }

  const key = `uploads/${name}`;
  const buf = await env.PHOTOS.get(key, "arrayBuffer");
  if (!buf) return json({ ok: false, error: "文件不存在" }, 404);

  const items = await readIndex(env);
  const meta = items.find((item) => String(item.src || "").endsWith(name));
  const mime = meta?.mime || "image/jpeg";

  return new Response(buf, {
    headers: {
      ...corsHeaders("*"),
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (pathname === "/api/health") {
      const items = await readIndex(env);
      return json({ ok: true, count: items.length, storage: "kv" }, 200, origin);
    }

    if (pathname === "/api/photos") {
      return json({ photos: await readIndex(env) }, 200, origin);
    }

    if (pathname.startsWith("/api/file/")) {
      return serveFile(pathname, env);
    }

    if (pathname === "/api/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ ok: false, error: "static assets not bound" }, 500, origin);
  },
};
