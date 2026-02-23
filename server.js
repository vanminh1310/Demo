require("dotenv").config();
const express = require("express");
const Groq = require("groq-sdk");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const { addWatermark } = require("./watermark");
const http = require("http");
const { Server } = require("socket.io");
const User = require("./models/User");
const PostedProperty = require("./models/PostedProperty");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cookieParser());
app.use(express.static("public", { index: false }));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log("✅ MongoDB connected!");
  const count = await User.countDocuments();
  if (count === 0) {
    const un = process.env.NV_USERNAME || 'admin';
    const pw = process.env.NV_PASSWORD || 'admin1234';
    await User.create({ username: un, password: pw });
    console.log(`🔑 Default admin created (${un} / ${pw})`);
  }
}).catch(console.error);

const authenticate = (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid Token" });
  }
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function getPosted() {
  const docs = await PostedProperty.find({});
  return docs.map(d => d.propertyId);
}
async function savePosted(id) {
  try { await PostedProperty.create({ propertyId: id }); } catch (e) { }
}

async function getPageToken(pageId) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/me/accounts?access_token=${process.env.FB_ACCESS_TOKEN}`);
    const page = res.data.data.find(p => p.id === pageId);
    return page?.access_token || process.env.FB_ACCESS_TOKEN;
  } catch (err) {
    return process.env.FB_ACCESS_TOKEN;
  }
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

  // Xử lý giấu số nhà: Chỉ lấy Tên Đường, Phường, Quận, Thành Phố
  // Ví dụ: "123/4B Đường Số 1, Phường 4, Quận 8, Hồ Chí Minh" -> "Đường Số 1, Phường 4, Quận 8, Hồ Chí Minh"
  // Thuật toán: Tách bằng dấu phẩy, nếu phần đầu tiên chứa số (số nhà), cắt bỏ phần chữ số đó đi.
  let addressFiltered = property.addressFull || "";
  if (addressFiltered) {
    let parts = addressFiltered.split(',');
    // Nếu phần đầu tiên có chứa số (như 123 Lê Lợi)
    if (parts.length > 0 && /\d/.test(parts[0])) {
      // Tìm vị trí chữ cái đầu tiên để bỏ phần số nhà đi
      parts[0] = parts[0].replace(/^[0-9A-Za-z\/\-\s]+(?=[A-ZĐ])/, '').trim();
    }
    addressFiltered = parts.join(',').trim();
    // Đảm bảo luôn có "Quận 8" nếu lỡ bị thiếu
    if (!addressFiltered.includes("Quận 8") && !addressFiltered.includes("Q8")) {
      addressFiltered += ", Quận 8";
    }
  }

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
Dòng 4-8: Liệt kê các TIỆN ÍCH và PHÍ DỊCH VỤ (điện, nước, rác...). MỖI Ý PHẢI XUỐNG DÒNG RIÊNG BIỆT (bắt đầu bằng emoji phù hợp)
Dòng 9: Câu tạo cảm giác gấp háp/kêu gọi hành động
Dòng 10: Inbox ngay / Nhắn tin ngay!
Dòng 11: 📞 033 234 7879 | Zalo: 033 234 7879
Dòng cuối: DÁNH SÁCH HASHTAG BẮT ĐẦU BẰNG DẤU # VÀ CÁCH NHAU BẰNG DẤU CÁCH. Bắt buộc phải có hashtag #novacity.

THÔNG TIN:
Tiêu đề: ${property.title}
Địa chỉ: ${addressFiltered}
Giá: ${gia}/tháng | Diện tích: ${property.area}m²
Mô tả: ${(property.description || "").substring(0, 400)}`
    }]
  });

  return {
    content: completion.choices[0].message.content,
    persona: selectedPersona.name
  };
}

async function uploadAndPost(property, caption, pageId) {
  const targetPageId = pageId || process.env.FB_PAGE_ID;
  const pageToken = await getPageToken(targetPageId);
  const images = (property.images || []).slice(0, 5);
  const mediaIds = [];
  for (const url of images) {
    try {
      const buf = await addWatermark(url);
      const form = new FormData();
      form.append("source", buf, { filename: "photo.jpg", contentType: "image/jpeg" });
      form.append("published", "false");
      form.append("access_token", pageToken);
      const res = await axios.post(`https://graph.facebook.com/v19.0/${targetPageId}/photos`, form, { headers: form.getHeaders() });
      mediaIds.push(res.data.id);
    } catch (e) { console.log("Ảnh lỗi:", e.message); }
  }
  const attached = mediaIds.map(id => ({ media_fbid: id }));
  const postRes = await axios.post(`https://graph.facebook.com/v19.0/${targetPageId}/feed`, {
    message: caption,
    attached_media: JSON.stringify(attached),
    access_token: pageToken,
  });
  await savePosted(property.id);
  return postRes.data.id;
}

// API: Lấy danh sách phòng chưa đăng
app.get("/api/pending", authenticate, async (req, res) => {
  try {
    const posted = await getPosted();
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

// API: Lấy danh sách các Fanpage Admin
app.get("/api/pages", authenticate, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/me/accounts?access_token=${process.env.FB_ACCESS_TOKEN}`);
    // Ẩn trang JoY theo yêu cầu
    const filteredPages = r.data.data.filter(p => p.name !== "JoY");
    res.json(filteredPages.map(p => ({ id: p.id, name: p.name, category: p.category })));
  } catch (e) {
    res.json([{ id: process.env.FB_PAGE_ID, name: "Fanpage Mặc định (Lỗi Graph API)" }]);
  }
});

// API: Xem bài đã đăng trên Fanpage
app.get("/api/fb-posts", authenticate, async (req, res) => {
  try {
    const targetPageId = req.query.pageId || process.env.FB_PAGE_ID;
    const pageToken = await getPageToken(targetPageId);
    const r = await axios.get(`https://graph.facebook.com/v19.0/${targetPageId}/feed?fields=id,message,created_time,full_picture,attachments&limit=20&access_token=${pageToken}`);
    res.json(r.data);
  } catch (e) {
    console.error("FB API Error:", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// ==========================================
// 4. FACEBOOK WEBHOOK (TỰ ĐỘNG REP COMMENT)
// ==========================================

// 4.1. Webhook Verification (Yêu cầu bắt buộc từ Facebook)
app.get("/webhook", (req, res) => {
  const verify_token = process.env.FB_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// 4.2. Xử lý Comment gửi về từ Webhook
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // 🔴 DEBUG LOG: In ra toàn bộ webhook FB gửi về & Phát qua Socket cho trang Debug
  console.log("====================================");
  console.log("🔔 [WEBHOOK EVENT RECEIVED]");
  console.log(JSON.stringify(body, null, 2));
  console.log("====================================");

  // Phát tín hiệu Realtime cho tất cả các tab /debug đang mở
  io.emit('webhook_event', body);

  if (body.object === "page" || body.object === "user") {
    // Luôn trả về 200 OK ngay lập tức cho FB khỏi bị timeout
    res.status(200).send("EVENT_RECEIVED");

    body.entry.forEach(async (entry) => {
      const changes = entry.changes;
      if (changes && changes[0] && changes[0].value) {
        const change = changes[0].value;

        // 1. Kiểm tra có đúng là sự kiện có người Comment vào bài viết
        if (change.item === "comment" && change.verb === "add") {
          const commentId = change.comment_id;
          const senderId = change.from.id;
          const message = change.message;
          const targetPageId = entry.id; // Lấy ID của trang nhận webhook

          // 2. Không được tự Reply chính comment của Fanpage mình (Infinity Loop)
          if (senderId === targetPageId) return;

          console.log(`\n💬 Có Comment mới trên Page [${targetPageId}] từ [UID: ${senderId}]: "${message}"`);

          try {
            // 3. Dùng AI chém gió và tạo câu trả lời
            const completion = await groq.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages: [{
                role: "system",
                content: "Bạn là nhân viên tư vấn nhiệt tình của Fanpage cho thuê phòng trọ NovaCity tại TP.HCM. Khách hàng vừa comment hỏi về phòng trọ (có thể là hỏi giá, còn phòng không, inbox). Hãy viết một câu trả lời CỰC KỲ NGẮN GỌN (dưới 3 câu), lịch sự, mời họ check inbox hoặc nhắn tin trực tiếp để trao đổi chi tiết. Không cần chào hỏi dài dòng, đi thẳng vào vấn đề."
              }, {
                role: "user",
                content: `Khách hàng comment: "${message}"`
              }]
            });

            const replyMsg = completion.choices[0].message.content;
            console.log(`🤖 AI Reply: "${replyMsg}"`);

            const pageToken = await getPageToken(targetPageId);
            // 4. Đẩy câu Reply lên Facebook thông qua Graph API (Comment_ID/comments)
            await axios.post(
              `https://graph.facebook.com/v21.0/${commentId}/comments`,
              { message: replyMsg },
              { params: { access_token: pageToken } }
            );
            console.log("✅ Đã tự động Reply Comment thành công!");

          } catch (error) {
            console.error("❌ Lỗi khi Auto Reply:", error.response?.data || error.message);
          }
        }
      }
    });
  } else {
    res.sendStatus(404);
  }
});

// ==========================================
// THIẾT LẬP ROUTE & KHỞI ĐỘNG SERVER
// ==========================================

// Bấm vào đường link này để Tự tạo tài khoản Admin
app.get("/api/setup", async (req, res) => {
  try {
    const un = process.env.NV_USERNAME || 'admin';
    const pw = process.env.NV_PASSWORD || 'admin1234@123';

    // Xóa admin cũ (nếu có bị kẹt lỗi)
    await User.deleteMany({ username: un });

    // Tạo lại admin mới
    await User.create({ username: un, password: pw });

    res.send(`<h1>Tạo thành công!</h1><p>Tài khoản: <b>${un}</b></p><p>Mật khẩu: <b>${pw}</b></p><br><a href="/">Bấm vào đây để Quay lại màn hình Đăng Nhập</a>`);
  } catch (e) {
    res.send("Lỗi: " + e.message);
  }
});

// API: Generate caption preview
app.post("/api/preview", authenticate, async (req, res) => {
  try {
    const { property } = req.body;
    const result = await generateCaption(property);
    res.json({ caption: result.content, persona: result.persona });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Đăng bài
app.post("/api/post", authenticate, async (req, res) => {
  try {
    const { property, caption, pageId } = req.body;
    const postId = await uploadAndPost(property, caption, pageId);
    res.json({ success: true, postId });
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

// API: Đăng nhập
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await user.comparePassword(password)) {
      const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Tài khoản hoặc mật khẩu không đúng!" });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve frontend
app.get("/", (req, res) => {
  const token = req.cookies.auth_token;
  try {
    if (token && jwt.verify(token, process.env.JWT_SECRET)) {
      return res.sendFile(path.join(__dirname, "views", "dashboard.html"));
    }
  } catch (e) { }
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

// ==========================================
// COMPLIANCE PAGES FOR FACEBOOK APP REVIEW
// ==========================================

const commonStyles = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    h2 { color: #1e40af; margin-top: 30px; }
    p { margin-bottom: 15px; }
    ul, ol { margin-bottom: 20px; }
    li { margin-bottom: 8px; }
    .container { background: #fff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 30px; border: 1px solid #f3f4f6; }
  </style>
`;

// Serve Privacy Policy
app.get("/privacy-policy", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Privacy Policy - NovaCity Auto-post</title>
      ${commonStyles}
    </head>
    <body>
      <div class="container">
        <h1>Privacy Policy</h1>
        <p><strong>Last Updated:</strong> February 2026</p>
        <p>NovaCity Auto-post ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy outlines how we collect, use, and safeguard the information associated with our Facebook App integration.</p>
        
        <h2>1. Information We Collect</h2>
        <p>We access data from your connected Facebook Page (including public posts and user comments) strictly for the purpose of operating the automated posting and auto-reply functionalities you have explicitly authorized.</p>
        
        <h2>2. How We Use Your Information</h2>
        <p>The collected data is processed in real-time by our integrated Artificial Intelligence (AI) services solely to generate contextual responses and captions. We do not use this data for marketing, profiling, or any other unauthorized purposes.</p>
        
        <h2>3. Data Sharing and Disclosure</h2>
        <p>We do not sell, trade, or otherwise transfer your identifiable data to outside parties. Data is only transmitted securely via API to our AI processing partners (e.g., Groq) for the immediate generation of content, and it is not retained or used to train their models.</p>
        
        <h2>4. Data Retention</h2>
        <p>We do not permanently store personal data or user comments on our servers. Information is held only momentarily during the AI generation process.</p>
        
        <h2>5. Contact Us</h2>
        <p>If you have any questions regarding this Privacy Policy, please contact us via our official fanpage.</p>
      </div>
    </body>
    </html>
  `);
});

// Serve Terms of Service
app.get("/terms-of-service", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Terms of Service - NovaCity Auto-post</title>
      ${commonStyles}
    </head>
    <body>
      <div class="container">
        <h1>Terms of Service</h1>
        <p><strong>Last Updated:</strong> February 2026</p>
        
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing and using the NovaCity Auto-post application, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must not use our service.</p>
        
        <h2>2. Service Description</h2>
        <p>NovaCity Auto-post is an automated tool designed to assist Page administrators in publishing property listings and automatically generating AI-driven replies to user comments on their connected Facebook Pages.</p>
        
        <h2>3. User Responsibilities</h2>
        <p>You authorize NovaCity Auto-post to act on your behalf to manage page content and engage with users. You are solely responsible for ensuring that the automated content does not violate Facebook's Community Standards or Terms of Service.</p>
        
        <h2>4. Disclaimer of Warranties</h2>
        <p>The service is provided on an "as is" and "as available" basis. We make no warranties, expressed or implied, regarding the reliability, accuracy, or uninterrupted operation of the AI generation or the Facebook Graph API integration.</p>
        
        <h2>5. Limitation of Liability</h2>
        <p>In no event shall NovaCity Auto-post be liable for any indirect, incidental, special, or consequential damages arising out of the use or inability to use the service, including account suspension by Facebook.</p>
      </div>
    </body>
    </html>
  `);
});

// Serve Data Deletion Instructions
app.get("/data-deletion", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Data Deletion Instructions - NovaCity Auto-post</title>
      ${commonStyles}
    </head>
    <body>
      <div class="container">
        <h1>Data Deletion Instructions</h1>
        <p>NovaCity Auto-post values your privacy and ensures that user data is handled securely. Because we do not persistently store personal data or comment history on our servers, there is no centralized database holding your information.</p>
        
        <h2>Removing Access and Associated Data</h2>
        <p>If you wish to revoke our application's access and ensure no further data is processed, you must remove the app integration from your Facebook account. Please follow these steps:</p>
        <ol>
          <li>Log in to your Facebook account.</li>
          <li>Navigate to the top right menu and select <strong>Settings & Privacy</strong>, then click on <strong>Settings</strong>.</li>
          <li>In the left sidebar, click on <strong>Security and Login</strong> or scroll down to find <strong>Business Integrations</strong> (or <strong>Apps and Websites</strong>).</li>
          <li>Locate the <strong>NovaCity Auto-post</strong> (or your custom App name) in the list of active integrations.</li>
          <li>Click the <strong>Remove</strong> button next to the application.</li>
          <li>Confirm your choice in the dialog box.</li>
        </ol>
        
        <p>Upon completing these steps, the application will immediately lose access to your Facebook Page, and no further automated actions or data processing will occur.</p>
      </div>
    </body>
    </html>
  `);
});

// ==========================================
// THÊM TRANG DEBUG REALTIME CHO WEBHOOK
// ==========================================
app.get("/debug", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>🟢 Webhook Real-time Debugger</title>
      <style>
        body { background: #0f172a; color: #00ff00; font-family: 'Courier New', Courier, monospace; padding: 20px; margin: 0; }
        h1 { border-bottom: 2px solid #334155; padding-bottom: 10px; margin-top: 0; }
        .log-entry { margin-bottom: 15px; padding: 10px; background: #1e293b; border-radius: 4px; border-left: 4px solid #3b82f6; white-space: pre-wrap; word-break: break-all; }
        .timestamp { color: #94a3b8; font-size: 0.85em; margin-bottom: 5px; }
      </style>
    </head>
    <body>
      <h1>🟢 Đang nghe tín hiệu Webhook từ Facebook...</h1>
      <div id="logs">Mở app Facebook và thử comment để xem tín hiệu nhảy vào đây nhé! (Cần phải chờ FB duyệt App thì khách lạ comment mới nhảy)</div>
      
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        const logsDiv = document.getElementById('logs');
        let isFirst = true;
        
        socket.on('webhook_event', (data) => {
          if (isFirst) { logsDiv.innerHTML = ''; isFirst = false; }
          
          const entry = document.createElement('div');
          entry.className = 'log-entry';
          
          const time = new Date().toLocaleTimeString('vi-VN');
          const ts = document.createElement('div');
          ts.className = 'timestamp';
          ts.innerText = '[' + time + '] NHẬN ĐƯỢC TÍN HIỆU:';
          
          const content = document.createElement('div');
          content.innerText = JSON.stringify(data, null, 2);
          
          entry.appendChild(ts);
          entry.appendChild(content);
          logsDiv.prepend(entry); // Thêm lên đầu danh sách
        });
      </script>
    </body>
    </html>
  `);
});

server.listen(3333, () => console.log("🚀 Dashboard chạy tại http://localhost:3333"));
