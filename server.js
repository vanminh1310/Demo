require("dotenv").config();
const express = require("express");
const Groq = require("groq-sdk");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");
const { addWatermark } = require("./watermark");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PAGE_ID = process.env.FB_PAGE_ID;
const POSTED_FILE = "posted.json";

function getPosted() {
  if (!fs.existsSync(POSTED_FILE)) return [];
  return JSON.parse(fs.readFileSync(POSTED_FILE));
}
function savePosted(id) {
  const posted = getPosted();
  if (!posted.includes(id)) { posted.push(id); fs.writeFileSync(POSTED_FILE, JSON.stringify(posted)); }
}

async function getPageToken() {
  const res = await axios.get(`https://graph.facebook.com/v19.0/me/accounts?access_token=${process.env.FB_ACCESS_TOKEN}`);
  const page = res.data.data.find(p => p.id === PAGE_ID);
  return page?.access_token || process.env.FB_ACCESS_TOKEN;
}

async function generateCaption(property) {
  const gia = Number(property.priceTotal) >= 1000000
    ? `${(Number(property.priceTotal) / 1000000).toFixed(1)} triệu`
    : `${property.priceTotal} triệu`;

  const personas = [
    {
      name: "Nhiệt tình & Thân thiện",
      description: "Giọng văn của một admin fanpage thân thiện, hay dùng các từ như 'cực chill', 'siêu ưng', 'nhanh tay kẻo lỡ', thả nhiều emoji tươi sáng."
    },
    {
      name: "Tập trung Sang trọng & Tiện nghi",
      description: "Giọng văn lịch sự, chuyên nghiệp, đánh mạnh vào không gian sống đẳng cấp, tiện ích vượt trội, yên tĩnh, an ninh tốt. Hạn chế dùng từ lóng."
    },
    {
      name: "Sale chốt đơn (Ngắn gọn & Vào thẳng vấn đề)",
      description: "Đánh mạnh vào giá phòng hợp lý, deal hời. Đi thẳng vào thông số diện tích, tiện ích và giá. Câu cú ngắn, dứt khoát, hối thúc người xem xem phòng ngay."
    },
    {
      name: "Gen-Z năng động",
      description: "Giọng văn trẻ trung, bắt trend, dùng ngôn ngữ mạng nhẹ nhàng, cảm giác thư giãn như đang tâm sự với bạn bè. Phù hợp cho sinh viên, dân văn phòng trẻ."
    }
  ];

  const selectedPersona = personas[Math.floor(Math.random() * personas.length)];

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{
      role: "user", content: `Bạn là admin fanpage cho thuê phòng trọ tại TP.HCM.

PHONG CÁCH YÊU CẦU CHO LẦN ĐĂNG NÀY:
${selectedPersona.description}

NHIỆM VỤ: Viết bài đăng Facebook cho thuê phòng trọ theo đúng phong cách yêu cầu trên. KHÔNG dùng markdown ** hay ##.

CẤU TRÚC:
Dòng 1: Câu mở đầu hấp dẫn phù hợp phong cách
Dòng 2: 📍 Địa chỉ
Dòng 3: 💰 Giá + diện tích
Dòng 4-8: Tiện ích nổi bật với emoji (chỉ dùng thông tin thật)
Dòng 9: Câu tạo cảm giác gấp háp/kêu gọi hành động
Dòng 10: Inbox ngay / Nhắn tin ngay!
Dòng 11: 📞 033 234 7879 | Zalo: 033 234 7879
Dòng cuối: DÁNH SÁCH HASHTAG BẮT ĐẦU BẰNG DẤU # VÀ CÁCH NHAU BẰNG DẤU CÁCH. Bắt buộc phải có hashtag #novacity. (Ví dụ: #novacity #phongtro #chothuephong #phongtrogiare)

THÔNG TIN:
Tiêu đề: ${property.title}
Địa chỉ: ${property.addressFull}
Giá: ${gia}/tháng | Diện tích: ${property.area}m²
Mô tả: ${(property.description || "").substring(0, 400)}`
    }]
  });

  return {
    content: completion.choices[0].message.content,
    persona: selectedPersona.name
  };
}

async function uploadAndPost(property, caption) {
  const pageToken = await getPageToken();
  const images = (property.images || []).slice(0, 5);
  const mediaIds = [];
  for (const url of images) {
    try {
      const buf = await addWatermark(url);
      const form = new FormData();
      form.append("source", buf, { filename: "photo.jpg", contentType: "image/jpeg" });
      form.append("published", "false");
      form.append("access_token", pageToken);
      const res = await axios.post(`https://graph.facebook.com/v19.0/${PAGE_ID}/photos`, form, { headers: form.getHeaders() });
      mediaIds.push(res.data.id);
    } catch (e) { console.log("Ảnh lỗi:", e.message); }
  }
  const attached = mediaIds.map(id => ({ media_fbid: id }));
  const postRes = await axios.post(`https://graph.facebook.com/v19.0/${PAGE_ID}/feed`, {
    message: caption,
    attached_media: JSON.stringify(attached),
    access_token: pageToken,
  });
  savePosted(property.id);
  return postRes.data.id;
}

// API: Lấy danh sách phòng chưa đăng
app.get("/api/pending", async (req, res) => {
  try {
    const posted = getPosted();
    console.log("🔍 Fetching properties from NovaCity API...");
    const r = await axios.get(`${process.env.NOVACITY_API}?status=AVAILABLE&limit=100`, { timeout: 30000 });
    const props = (r.data.properties || []).map(p => ({
      id: p.id, title: p.title, addressFull: p.addressFull,
      priceTotal: p.priceTotal, area: p.area,
      images: p.images || [], posted: posted.includes(p.id),
      description: p.description
    }));
    console.log(`✅ Found ${props.length} properties.`);
    res.json({ properties: props, postedCount: posted.length });
  } catch (e) {
    console.error("NovaCity API Error:", e.response?.data || e.message);
    // Trả về dữ liệu trống thay vì lỗi 500 để giao diện không bị vỡ
    res.json({ properties: [], postedCount: getPosted().length, error: "NovaCity API đang bận, vui lòng thử lại sau" });
  }
});

// API: Xem bài đã đăng trên Fanpage
app.get("/api/fb-posts", async (req, res) => {
  try {
    const pageToken = await getPageToken();
    const r = await axios.get(`https://graph.facebook.com/v19.0/${PAGE_ID}/feed?fields=id,message,created_time,full_picture,attachments&limit=20&access_token=${pageToken}`);
    res.json(r.data);
  } catch (e) {
    console.error("FB API Error:", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// API: Generate caption preview
app.post("/api/preview", async (req, res) => {
  try {
    const { property } = req.body;
    const result = await generateCaption(property);
    res.json({ caption: result.content, persona: result.persona });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Đăng bài
app.post("/api/post", async (req, res) => {
  try {
    const { property, caption } = req.body;
    const postId = await uploadAndPost(property, caption);
    res.json({ success: true, postId });
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.listen(3333, () => console.log("🚀 Dashboard chạy tại http://localhost:3333"));
