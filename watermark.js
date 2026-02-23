const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "logo.png");
const CONTACT_PHONE = "033 234 7879";
const CONTACT_ZALO = "033 234 7879"; // same number

// Download ảnh từ URL về buffer
async function downloadImage(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data);
}

// Tạo SVG overlay: logo góc trên trái + contact info góc dưới
function createOverlaySVG(width, height) {
  const barHeight = Math.round(height * 0.1); // thanh banner dưới = 10% chiều cao
  const fontSize = Math.round(barHeight * 0.38);
  const logoSize = Math.round(height * 0.12);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Banner contact dưới cùng -->
      <rect x="0" y="${height - barHeight}" width="${width}" height="${barHeight}" fill="#1a3a6b" opacity="0.88"/>
      
      <!-- Icon phone -->
      <text x="18" y="${height - barHeight / 2 + fontSize / 3}" 
            font-size="${fontSize}" font-family="Arial" fill="#ffffff">📞</text>
      
      <!-- Số điện thoại -->
      <text x="${Math.round(fontSize * 1.8)}" y="${height - barHeight / 2 + fontSize / 3}" 
            font-size="${fontSize}" font-family="Arial, sans-serif" 
            fill="#ffffff" font-weight="bold">${CONTACT_PHONE}</text>
      
      <!-- Divider -->
      <text x="${Math.round(width * 0.38)}" y="${height - barHeight / 2 + fontSize / 3}" 
            font-size="${fontSize}" font-family="Arial" fill="#aaaaaa">|</text>
      
      <!-- Zalo icon + số -->
      <text x="${Math.round(width * 0.42)}" y="${height - barHeight / 2 + fontSize / 3}" 
            font-size="${fontSize}" font-family="Arial" fill="#00d4ff">Zalo:</text>
      <text x="${Math.round(width * 0.42 + fontSize * 3.2)}" y="${height - barHeight / 2 + fontSize / 3}" 
            font-size="${fontSize}" font-family="Arial, sans-serif" 
            fill="#ffffff" font-weight="bold">${CONTACT_ZALO}</text>

      <!-- Logo background (góc trên phải) -->
      <rect x="${width - logoSize - 12}" y="8" 
            width="${logoSize + 8}" height="${Math.round(logoSize * 0.55)}" 
            rx="6" fill="white" opacity="0.85"/>
    </svg>
  `);
}

// Hàm chính: chèn logo + watermark contact vào ảnh
async function addWatermark(imageUrl) {
  console.log(`  🖼️ Đang xử lý ảnh...`);

  // Download ảnh gốc
  const imgBuffer = await downloadImage(imageUrl);

  // Lấy kích thước ảnh gốc
  const meta = await sharp(imgBuffer).metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;

  // Logo resize to hơn: 20% chiều cao ảnh
  const logoHeight = Math.round(height * 0.12);
  const logoWidth = Math.round(logoHeight * 2.2);
  const logoResized = await sharp(LOGO_PATH)
    .resize(logoWidth, logoHeight, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  // Tạo nền trắng bo tròn cho logo
  const logoBgWidth = logoWidth + 20;
  const logoBgHeight = logoHeight + 16;
  const logoBg = Buffer.from(`
    <svg width="${logoBgWidth}" height="${logoBgHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${logoBgWidth}" height="${logoBgHeight}" rx="10" fill="white" opacity="0.92"/>
    </svg>
  `);

  // SVG overlay (banner dưới)
  const overlaySVG = createOverlaySVG(width, height);

  // Ghép tất cả lại
  const logoX = width - logoBgWidth - 16;
  const logoY = 16;
  const result = await sharp(imgBuffer)
    .composite([
      // Banner contact dưới
      { input: overlaySVG, top: 0, left: 0 },
      // Nền trắng cho logo
      { input: logoBg, top: logoY, left: logoX },
      // Logo góc trên phải
      { input: logoResized, top: logoY + 8, left: logoX + 10 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  return result;
}

module.exports = { addWatermark };
