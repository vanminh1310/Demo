const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const axios = require("axios");

const PAGE_ID = process.env.FB_PAGE_ID;
const USER_TOKEN = process.env.FB_ACCESS_TOKEN;

async function checkToken() {
  try {
    console.log("Checking User Token status...");
    if (!USER_TOKEN || USER_TOKEN.length < 10) {
      throw new Error("Invalid or missing FB_ACCESS_TOKEN in .env");
    }
    // Check if user token is valid and get page access token
    const res = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${USER_TOKEN}`
    );
    console.log("✅ User Token is VALID.");
    
    const page = res.data.data.find((p) => p.id === PAGE_ID);
    if (page) {
      console.log(`✅ Found Page: ${page.name} (${page.id})`);
      console.log("✅ Page Access Token available.");
    } else {
      console.log("⚠️ Page ID not found in the account associated with this token.");
    }
  } catch (err) {
    console.error("❌ Token is EXPIRED or INVALID.");
    console.error("Error Details:", err.response?.data?.error?.message || err.message);
  }
}

checkToken();
