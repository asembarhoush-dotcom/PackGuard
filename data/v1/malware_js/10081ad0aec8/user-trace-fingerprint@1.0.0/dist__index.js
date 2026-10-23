// src/core.ts
var DEFAULT_KEY = process.env.FP_COOKIE_KEY || "fp_id";
function generateFingerprint(length = 32) {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = Array.from({ length: 100 }, (_, i) => (i + 1).toString());
  let fingerprint = "";
  while (fingerprint.length < length) {
    const type = Math.floor(Math.random() * 3);
    if (type === 0) {
      fingerprint += upper[Math.floor(Math.random() * upper.length)];
    } else if (type === 1) {
      fingerprint += lower[Math.floor(Math.random() * lower.length)];
    } else {
      const number = digits[Math.floor(Math.random() * digits.length)];
      fingerprint += number;
    }
  }
  return fingerprint.slice(0, length);
}

// src/device.ts
function getDeviceInfo() {
  if (typeof navigator === "undefined") {
    return {
      environment: "node",
      platform: process.platform,
      nodeVersion: process.version,
      cpuArch: process.arch,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
  return {
    environment: "browser",
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.mediaDevices || "unknown",
    // in GB (may not be supported)
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth
    },
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    touchSupport: {
      maxTouchPoints: navigator.maxTouchPoints,
      touchEvent: "ontouchstart" in window
    }
  };
}

// src/ip.ts
async function getIP(apiKey) {
  if (typeof fetch === "undefined") return null;
  const key = apiKey ? `&key=${apiKey}` : "";
  try {
    const res = await fetch("https://api64.ipify.org?format=json");
    const data = await res.json();
    const returnData = `?fields=status,message,continent,continentCode,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`;
    const url = process.env.NODE_ENV === "development" ? `http://ip-api.com/json/${data.ip}${returnData}${key}` : `https://ip-api.com/json/${data.ip}${returnData}${key}`;
    const resIPInformation = await fetch(url);
    const dataIPInformation = await resIPInformation.json();
    console.log(dataIPInformation);
    if (dataIPInformation.status === "success") {
      delete dataIPInformation.query;
      return { ...dataIPInformation, ip: data.ip };
    } else {
      return { ...data, status: "success" };
    }
  } catch {
    return {
      status: "fail",
      message: "unavailable to service"
    };
  }
}
export {
  generateFingerprint,
  getDeviceInfo,
  getIP
};
