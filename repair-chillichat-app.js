const fs = require("fs");
const cp = require("child_process");

const app = "C:\\Users\\jaggy\\OneDrive\\Desktop\\ChilliChat\\public\\app.js";
const pristine = app + ".before-picker-fix";
const emergency = app + ".before-final-recovery";

function stop(message) {
  console.error("STOP: " + message);
  process.exit(1);
}

if (!fs.existsSync(pristine)) {
  stop("Pristine backup does not exist: " + pristine);
}

if (fs.existsSync(app)) {
  fs.copyFileSync(app, emergency);
}

let text = fs.readFileSync(pristine, "utf8");

const marker = "(function maybeShowIosInstallBanner() {";

const first = text.indexOf(marker);

if (first === -1) {
  stop("First iOS banner function not found.");
}

const second = text.indexOf(marker, first + marker.length);

if (second === -1) {
  stop("Second iOS banner function not found.");
}

const firstSection = text.slice(first, second);
const closePos = firstSection.indexOf("})();");

if (closePos === -1) {
  stop("Could not find end of first iOS banner.");
}

const end = first + closePos + 5;

text = text.slice(0, first) + text.slice(end);

fs.writeFileSync(app, text, "utf8");

const fixed = fs.readFileSync(app, "utf8");

const required = [
  'const IDLE_LIMIT_MS = 5 * 60 * 1000;',
  'const STORAGE_HANDLE_KEY = "chillichat_handle";',
  'const STORAGE_COLOR_KEY = "chillichat_color";',
  'const STORAGE_TOKEN_KEY = "chillichat_device_token";'
];

console.log("");
console.log("CHECKING REQUIRED CONSTANTS");

for (const value of required) {
  if (!fixed.includes(value)) {
    stop("Missing required declaration: " + value);
  }

  console.log("PASS: " + value);
}

const bannerCount =
  (fixed.match(/maybeShowIosInstallBanner/g) || []).length;

console.log("");
console.log("IOS BANNER COUNT: " + bannerCount);

if (bannerCount !== 1) {
  stop("Expected exactly one iOS banner.");
}

console.log("");
console.log("RUNNING NODE SYNTAX CHECK");

cp.execFileSync(process.execPath, ["--check", app], {
  stdio: "inherit"
});

console.log("");
console.log("================================");
console.log("APP.JS RECOVERY PASSED");
console.log("================================");