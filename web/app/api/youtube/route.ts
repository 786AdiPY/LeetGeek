import { NextRequest, NextResponse } from "next/server";

interface VideoItem {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  url: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://leetcode.com",
  "https://www.geeksforgeeks.org",
  "https://www.codechef.com",
  "https://codeforces.com",
  "https://www.hackerrank.com",
  "https://leet-geek.vercel.app",
]);

function corsHeaders(origin: string | null) {
  const allowed =
    origin &&
    (ALLOWED_ORIGINS.has(origin) ||
      origin.startsWith("chrome-extension://") ||
      origin.startsWith("moz-extension://"))
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// In-memory cache for search queries (24 hours TTL)
const cache = new Map<string, { timestamp: number; data: VideoItem[] }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 200, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const CORS = corsHeaders(origin);

  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get("q") || searchParams.get("query") || "";
  const platform = searchParams.get("platform") || "leetcode";

  if (!rawQuery) {
    return NextResponse.json({ error: "Missing search query parameter 'q'" }, { status: 400, headers: CORS });
  }

  const query = `${rawQuery} ${platform} solution`.trim();
  const cacheKey = query.toLowerCase();

  // Check in-memory cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ source: "cache", videos: cached.data }, { headers: CORS });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey) {
    try {
      const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=3&q=${encodeURIComponent(
        query
      )}&type=video&key=${apiKey}`;

      const res = await fetch(ytUrl);
      if (res.ok) {
        const json = await res.json();
        const videos: VideoItem[] = (json.items || [])
          .map((item: any) => ({
            videoId: item.id?.videoId || "",
            title: item.snippet?.title || rawQuery,
            thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
            channelTitle: item.snippet?.channelTitle || "YouTube",
            url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
          }))
          .filter((v: VideoItem) => v.videoId);

        if (videos.length > 0) {
          cache.set(cacheKey, { timestamp: Date.now(), data: videos });
          return NextResponse.json({ source: "api", videos }, { headers: CORS });
        }
      }
    } catch (err) {
      console.warn("[LeetGeek] YouTube API call failed, using fallback:", err);
    }
  }

  // Fallback metadata if API Key is missing, quota exceeded, or network fails
  const fallbackVideos: VideoItem[] = [
    {
      videoId: "",
      title: `${rawQuery} — YouTube Video Solutions`,
      thumbnail: "",
      channelTitle: "YouTube",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    },
  ];

  return NextResponse.json({ source: "fallback", videos: fallbackVideos }, { headers: CORS });
}
