export default {
  async fetch(request, env, ctx) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response("❌ Missing ?url= parameter", { status: 400 });
    }

    try {
      // কাস্টম হেডার কনফিগার (প্রয়োজন অনুযায়ী ডোমেইন যোগ করুন)
      const rules = {
        // "example.com": {
        //   Origin: "https://example.com",
        //   Referer: "https://example.com/",
        // },
      };

      // ডিফল্ট ইউজার-এজেন্ট
      let customHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      };

      // হোস্ট মিলিয়ে হেডার যোগ করুন
      const host = new URL(targetUrl).hostname;
      for (const ruleHost in rules) {
        if (host.includes(ruleHost)) {
          Object.assign(customHeaders, rules[ruleHost]);
          break;
        }
      }

      // আসল M3U8 ফাইল ফেচ করুন
      const resp = await fetch(targetUrl, { headers: customHeaders });

      if (!resp.ok) {
        return new Response(`Failed to fetch: ${resp.status} ${resp.statusText}`, {
          status: resp.status,
        });
      }

      let text = await resp.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      // রিলেটিভ পাথকে অ্যাবসলিউট URL-এ রূপান্তর
      const rewritten = text
        .split("\n")
        .map((line) => {
          line = line.trim();
          if (!line || line.startsWith("#")) return line;
          if (line.startsWith("http://") || line.startsWith("https://")) return line;
          return encodeURI(baseUrl + line);
        })
        .join("\n");

      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store", // বাফারিং এড়াতে
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response("Worker error: " + err.message, { status: 500 });
    }
  },
};
