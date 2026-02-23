const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const axios = require("axios");
const fs = require("fs");

const POSTED_FILE = "posted.json";

function getPosted(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath));
  } catch (e) {
    return [];
  }
}

async function checkNewProperties() {
  try {
    const path = require("path");
    const postedFilePath = path.join(__dirname, POSTED_FILE);
    const posted = getPosted(postedFilePath);
    console.log(`Currently have ${posted.length} properties in posted list.`);
    
    const apiUrl = process.env.NOVACITY_API + "?status=AVAILABLE&limit=50";
    console.log("Fetching from:", apiUrl);
    const res = await axios.get(apiUrl);
    const all = res.data.properties || [];
    const newProps = all.filter((p) => !posted.includes(p.id));

    if (newProps.length > 0) {
      console.log(`NEW_PROPERTIES_FOUND: ${newProps.length}`);
      newProps.forEach(p => {
        console.log(`- [${p.id}] ${p.title} (${p.priceTotal} tr/tháng)`);
      });
    } else {
      console.log("NO_NEW_PROPERTIES");
    }
  } catch (err) {
    console.error("Error checking properties:", err.message);
  }
}

checkNewProperties();
