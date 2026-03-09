require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const { addWatermark } = require("./watermark");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const POSTED_FILE = "posted.json";
const PAGE_ID = process.env.FB_PAGE_ID;

function getPosted() {
  if (!fs.existsSync(POSTED_FILE)) return [];
  return JSON.parse(fs.readFileSync(POSTED_FILE));
}

function savePosted(id) {
  const posted = getPosted();
  posted.push(id);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(posted));
}

async function getNewProperties() {
  const posted = getPosted();
  const res = await axios.get(process.env.NOVACITY_API + "?status=AVAILABLE&limit=50");
  const all = res.data.properties || [];
  return all.filter((p) => !posted.includes(p.id));
}

async function generateCaption(property) {
  const gia = Number(property.priceTotal) >= 1000000
    ? `${(Number(property.priceTotal) / 1000000).toFixed(1)} triệu`
    : `${property.priceTotal} triệu`;

  const features = [];
  if (property.bedrooms) features.push(`${property.bedrooms} phòng ngủ`);
  if (property.bathrooms) features.push(`${property.bathrooms} WC`);
  if (property.furnishing === "FULL") features.push("full nội thất");
  if (property.area) features.push(`${property.area}m²`);

  // Danh sách các phong cách AI (Personas)
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

  // Random chọn 1 persona
  const selectedPersona = personas[Math.floor(Math.random() * personas.length)];
  console.log(`\n🎭 Đang dùng phong cách AI: ${selectedPersona.name}`);

  const completion = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Bạn là admin fanpage cho thuê phòng trọ tại TP.HCM. Viết bài đăng Facebook chuyên nghiệp.
      
PHONG CÁCH YÊU CẦU CHO LẦN ĐĂNG NÀY:
${selectedPersona.description}

NHIỆM VỤ: Viết bài đăng theo đúng phong cách yêu cầu trên, nhưng vẫn phải giữ ĐÚNG các thông tin cốt lõi dưới đây. KHÔNG bị bóp méo thông tin.

CẤU TRÚC BÀI CHUẨN (KHÔNG dùng markdown ** hay ##):
Dòng 1: Câu mở đầu ngắn gọn, phù hợp với phong cách yêu cầu.
Dòng 2: Địa chỉ cụ thể + quận/huyện 📍
Dòng 3: Giá thuê + diện tích 💰
Dòng 4-8: Liệt kê tiện ích nổi bật (áp dụng văn phong của yêu cầu)
Dòng 9: Câu chốt hạ tạo cảm giác hấp dẫn/gấp gáp
Dòng 10: CTA: Nhắn tin hoặc inbox xem phòng
Dòng 11: 📞 033 234 7879 | Zalo: 033 234 7879
Dòng cuối: DANH SÁCH HASHTAG BẮT ĐẦU BẰNG DẤU # VÀ CÁCH NHAU BẰNG DẤU CÁCH. Bắt buộc phải có hashtag #novacity. (Ví dụ: #novacity #phongtro #chothuephong #phongtrogiare)

THÔNG TIN PHÒNG (Sử dụng chính xác):
Tiêu đề: ${property.title}
Địa chỉ: ${property.addressFull}
Giá: ${gia}/tháng | Diện tích: ${property.area}m²
Chi tiết thực tế: ${(property.description || "").substring(0, 400)}

YÊU CẦU BẮT BUỘC:
- KHÔNG dùng markup in đậm (**) hay tiêu đề (##).
- Độ dài khoảng 180-250 chữ (không kể hashtag).`
    }]
  });
  return completion.content[0].text;
}

// Upload ảnh đã watermark lên FB (dùng multipart form)
async function uploadPhoto(imageUrl, pageToken) {
  try {
    // Thêm watermark vào ảnh
    const watermarkedBuffer = await addWatermark(imageUrl);

    // Upload buffer lên Facebook
    const form = new FormData();
    form.append("source", watermarkedBuffer, { filename: "photo.jpg", contentType: "image/jpeg" });
    form.append("published", "false");
    form.append("access_token", pageToken);

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${PAGE_ID}/photos`,
      form,
      { headers: form.getHeaders() }
    );
    return res.data.id;
  } catch (e) {
    console.log(`  ⚠️ Lỗi ảnh: ${e.message?.substring(0, 80)}`);
    return null;
  }
}

// Đăng bài với nhiều ảnh
async function postToFacebook(caption, images, pageToken) {
  // Upload tối đa 5 ảnh
  const imageUrls = images.slice(0, 5);
  console.log(`📸 Đang upload ${imageUrls.length} ảnh...`);

  const mediaIds = [];
  for (const url of imageUrls) {
    const id = await uploadPhoto(url, pageToken);
    if (id) {
      mediaIds.push(id);
      console.log(`  ✅ Ảnh ${mediaIds.length}: OK`);
    }
  }

  if (mediaIds.length === 0) {
    throw new Error("Không upload được ảnh nào");
  }

  // Build attached_media
  const attachedMedia = mediaIds.map(id => ({ media_fbid: id }));

  // Đăng bài kèm nhiều ảnh
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${PAGE_ID}/feed`,
    {
      message: caption,
      attached_media: JSON.stringify(attachedMedia),
      access_token: pageToken,
    }
  );
  return res.data;
}

async function run() {
  console.log("🔍 Đang kiểm tra phòng mới từ novacity.vn...");
  const newProps = await getNewProperties();

  if (newProps.length === 0) {
    console.log("✅ Không có phòng mới để đăng.");
    return;
  }

  const property = newProps[0];
  console.log(`\n📋 Phòng: ${property.title}`);
  console.log(`📍 Địa chỉ: ${property.addressFull}`);
  console.log(`💰 Giá: ${property.priceTotal}`);
  console.log(`📸 Số ảnh: ${property.images?.length || 0}`);

  const images = property.images || [];
  if (images.length === 0) {
    console.log("⚠️ Không có ảnh, bỏ qua.");
    savePosted(property.id);
    return;
  }

  console.log("\n🤖 Đang nhờ AI viết caption...");
  const caption = await generateCaption(property);
  console.log("\n📝 Caption:\n" + "─".repeat(50));
  console.log(caption);
  console.log("─".repeat(50));

  // Lấy page token
  const pagesRes = await axios.get(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${process.env.FB_ACCESS_TOKEN}`
  );
  const page = pagesRes.data.data.find((p) => p.id === PAGE_ID);
  const pageToken = page?.access_token || process.env.FB_ACCESS_TOKEN;

  console.log(`\n📤 Đang đăng lên Fanpage với ${Math.min(images.length, 5)} ảnh...`);
  const result = await postToFacebook(caption, images, pageToken);
  console.log("✅ Đăng thành công! Post ID:", result.id);
  savePosted(property.id);
}

run().catch((err) => {
  console.error("❌ Lỗi:", err.response?.data || err.message);
});
