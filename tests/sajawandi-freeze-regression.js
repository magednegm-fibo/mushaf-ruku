// SAJAWANDI FREEZE REGRESSION
//
// This test freezes the behaviour of the Sajawandi stop-mark system.
//
// If this test fails, do not update the expected values blindly.
// First determine whether:
//   1. the implementation is wrong, or
//   2. the underlying stop-mark dataset intentionally changed.
//
// Expected values should only be updated after an intentional data review.
//
// Locks: MANUAL_ADDITIONS, MANUAL_EXCLUSIONS, CONFLICT_RESOLUTIONS,
// weakest-wins, LA/SALLI/MUANAQA/last-word policies, per-type counts,
// Indopak isolation.
//
//   node tests/sajawandi-freeze-regression.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dirArgIndex = process.argv.indexOf('--dir');
const rootDir = dirArgIndex !== -1 ? process.argv[dirArgIndex + 1] : path.join(__dirname, '..');

const dataSrc = fs.readFileSync(path.join(rootDir, 'data.js'), 'utf8');
const waqfPositionsSrc = fs.readFileSync(path.join(rootDir, 'waqf-positions.js'), 'utf8');
const rmSrc = fs.readFileSync(path.join(rootDir, 'readerManager.js'), 'utf8');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}

function getAyah(surah, ayah) {
  const re = new RegExp(
    '\\{"surah":' + surah + ',"surahName":"([^"]*)","ayah":' + ayah +
    ',"text":"((?:[^"\\\\]|\\\\.)*)"(?:,"juzStart":\\d+)?,"textIndopak":"((?:[^"\\\\]|\\\\.)*)"'
  );
  const m = re.exec(dataSrc);
  if (!m) throw new Error('Ayah ' + surah + ':' + ayah + ' not found');
  return {
    surah: surah, surahName: m[1], ayah: ayah,
    text: JSON.parse('"' + m[2] + '"'),
    textIndopak: JSON.parse('"' + m[3] + '"')
  };
}

function loadRM() {
  const warnings = [];
  const sandbox = {
    console: { warn: function (msg) { warnings.push(msg); }, log: function(){}, error: console.error },
    document: { addEventListener: function () {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(waqfPositionsSrc, sandbox, { filename: 'waqf-positions.js' });
  vm.runInContext(rmSrc, sandbox, { filename: 'readerManager.js' });
  sandbox.window.ReaderManager.init({
    PAGES: [], JUZ_INFO: [], state: { fontStyle: 'uthmani' }, els: {},
    toArabicDigits: function (n) { return String(n); },
    REMINDER_COLORS: {}, getWaqfMarks: function () { return {}; },
    showReader: function () {}, onBeforePageChange: function () {},
    onPageChanged: function () {}, onAfterRender: function () {}
  });
  sandbox.window.ReaderManager.__testWarnings = warnings;
  return sandbox.window.ReaderManager;
}

function hasClass(html, cls, key) {
  // data-key="s:a:idx" where idx = word-1
  const re = new RegExp('data-key="' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*class="([^"]*)"');
  // class may appear before data-key
  const re2 = new RegExp('class="([^"]*)"[^>]*data-key="' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
  let m = re.exec(html) || re2.exec(html);
  if (!m) {
    // try span with data-key containing class on same tag
    const re3 = new RegExp('<span[^>]*data-key="' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>');
    const m3 = re3.exec(html);
    if (!m3) return false;
    return m3[0].indexOf(cls) !== -1;
  }
  return m[1].split(/\s+/).indexOf(cls) !== -1;
}

function wordKey(surah, ayah, word1based) {
  return surah + ':' + ayah + ':' + (word1based - 1);
}

const RM = loadRM();
const FROZEN = 
{
  "adds": {
    "TA_MUTLAQ": [
      "10:16:16",
      "10:23:9",
      "10:24:38",
      "10:38:3",
      "10:83:14",
      "11:13:3",
      "11:28:15",
      "11:35:3",
      "11:41:7",
      "11:54:7",
      "11:88:21",
      "11:88:27",
      "11:88:31",
      "12:21:14",
      "12:21:23",
      "12:30:13",
      "12:36:21",
      "12:68:20",
      "12:88:17",
      "12:96:9",
      "13:18:25",
      "14:12:13",
      "14:12:9",
      "14:21:25",
      "14:34:11",
      "14:34:5",
      "14:5:14",
      "14:6:20",
      "16:28:12",
      "16:70:16",
      "16:76:19",
      "17:40:7",
      "17:5:14",
      "17:67:15",
      "17:97:23",
      "18:37:16",
      "18:49:23",
      "20:11:4",
      "21:103:6",
      "22:37:18",
      "22:78:14",
      "22:78:17",
      "22:78:38",
      "24:33:27",
      "24:33:39",
      "24:39:19",
      "24:40:13",
      "24:40:17",
      "24:40:23",
      "24:57:9",
      "25:43:5",
      "28:25:14",
      "28:32:21",
      "28:50:17",
      "28:77:21",
      "29:24:14",
      "2:102:71",
      "2:142:11",
      "2:142:15",
      "2:144:14",
      "2:144:20",
      "2:144:29",
      "2:243:17",
      "2:247:35",
      "2:247:40",
      "2:251:13",
      "2:258:23",
      "2:258:38",
      "2:272:13",
      "2:272:19",
      "2:272:8",
      "2:282:107",
      "2:282:115",
      "2:282:120",
      "2:282:122",
      "2:282:124",
      "2:282:71",
      "2:282:77",
      "2:282:86",
      "2:29:15",
      "2:72:5",
      "31:32:15",
      "32:20:5",
      "32:9:11",
      "33:13:21",
      "33:37:25",
      "33:37:44",
      "33:48:9",
      "33:4:19",
      "33:4:22",
      "33:53:26",
      "33:53:38",
      "33:53:45",
      "33:53:49",
      "33:53:63",
      "35:11:18",
      "35:11:29",
      "35:2:16",
      "35:43:11",
      "35:43:5",
      "39:21:25",
      "3:144:16",
      "3:144:24",
      "3:148:7",
      "3:151:16",
      "3:152:20",
      "3:152:35",
      "3:153:21",
      "3:162:11",
      "3:180:12",
      "3:180:16",
      "3:180:22",
      "3:180:26",
      "3:197:5",
      "3:28:21",
      "3:28:24",
      "3:65:13",
      "3:93:17",
      "40:35:15",
      "40:35:8",
      "40:56:17",
      "40:56:19",
      "41:12:10",
      "41:12:15",
      "42:45:10",
      "42:45:21",
      "42:51:19",
      "43:80:7",
      "45:23:17",
      "45:23:22",
      "46:8:12",
      "46:8:17",
      "46:8:22",
      "46:8:3",
      "48:29:24",
      "48:29:44",
      "49:13:16",
      "49:9:26",
      "4:105:11",
      "4:114:16",
      "4:171:31",
      "4:171:34",
      "4:171:38",
      "4:171:50",
      "4:20:13",
      "4:37:11",
      "4:84:17",
      "4:97:14",
      "4:97:22",
      "4:97:25",
      "4:97:9",
      "51:16:4",
      "51:16:9",
      "57:12:18",
      "57:15:11",
      "57:15:13",
      "57:20:25",
      "57:20:33",
      "57:23:9",
      "58:12:11",
      "58:12:15",
      "58:13:20",
      "58:13:7",
      "58:19:6",
      "58:19:9",
      "58:6:10",
      "59:19:7",
      "59:7:33",
      "5:43:12",
      "5:44:32",
      "5:48:42",
      "5:63:9",
      "5:66:16",
      "5:66:19",
      "5:68:15",
      "5:72:29",
      "5:7:14",
      "60:8:17",
      "61:6:24",
      "62:5:11",
      "62:5:18",
      "65:4:14",
      "65:4:20",
      "65:7:13",
      "65:7:20",
      "66:9:9",
      "6:128:31",
      "6:144:34",
      "6:165:14",
      "6:46:16",
      "6:62:6",
      "6:71:29",
      "6:71:35",
      "6:80:18",
      "6:80:23",
      "6:80:8",
      "6:90:11",
      "6:90:6",
      "74:27:4",
      "74:47:3",
      "77:14:5",
      "79:43:4",
      "79:44:3",
      "79:45:5",
      "7:157:30",
      "7:160:20",
      "7:160:25",
      "7:160:32",
      "7:160:37",
      "7:176:20",
      "7:187:15",
      "7:187:19",
      "7:187:23",
      "7:187:27",
      "7:187:5",
      "7:22:14",
      "7:27:23",
      "7:38:34",
      "7:43:28",
      "7:89:14",
      "7:89:25",
      "7:89:30",
      "7:89:33",
      "82:18:6",
      "83:19:4",
      "83:8:4",
      "88:1:4",
      "89:15:11",
      "8:16:18",
      "8:40:6",
      "8:43:16",
      "97:2:5",
      "9:111:23",
      "9:111:33",
      "9:115:13",
      "9:127:14",
      "9:73:9",
      "2:72:6",
      "5:46:26",
      "69:3:4",
      "70:7:2",
      "79:30:4",
      "79:42:5",
      "90:12:4",
      "91:10:4",
      "101:3:4",
      "101:10:4",
      "104:5:4"
    ],
    "QIF": [
      "11:63:18",
      "28:25:22",
      "2:102:66",
      "3:50:16",
      "4:171:28",
      "59:9:24",
      "6:62:9",
      "7:43:16",
      "7:46:14",
      "48:29:31"
    ],
    "JEEM": [
      "10:104:21",
      "10:10:7",
      "10:15:16",
      "11:27:20",
      "11:91:11",
      "11:97:6",
      "12:30:10",
      "12:36:10",
      "12:36:23",
      "12:96:13",
      "12:96:9",
      "18:49:19",
      "18:63:15",
      "21:5:9",
      "21:65:4",
      "22:78:32",
      "22:78:5",
      "24:11:14",
      "24:11:21",
      "24:11:6",
      "25:4:12",
      "25:58:8",
      "27:36:12",
      "2:198:8",
      "32:3:3",
      "33:4:15",
      "35:43:16",
      "3:150:3",
      "3:152:28",
      "41:35:5",
      "46:15:13",
      "46:15:39",
      "48:29:28",
      "48:29:3",
      "49:9:20",
      "4:142:6",
      "4:171:12",
      "4:54:9",
      "52:18:4",
      "59:7:23",
      "59:7:31",
      "5:44:23",
      "5:44:6",
      "5:68:25",
      "60:9:16",
      "66:2:6",
      "6:144:23",
      "6:161:12",
      "6:34:13",
      "6:34:17",
      "6:40:12",
      "6:60:14",
      "7:103:11",
      "7:143:11",
      "7:143:23",
      "7:143:32",
      "7:160:5",
      "7:176:10",
      "7:176:26",
      "7:190:8",
      "7:22:2",
      "7:46:8",
      "9:51:10",
      "9:74:24",
      "9:74:38",
      "9:95:14",
      "2:72:11",
      "3:48:5",
      "3:152:32",
      "4:171:28",
      "5:110:26",
      "6:161:7",
      "7:160:15",
      "7:187:10",
      "7:189:18",
      "10:15:31",
      "10:83:19",
      "35:43:21",
      "40:45:10",
      "56:23:3",
      "57:12:22",
      "59:9:31",
      "66:4:17",
      "76:11:8",
      "79:16:6",
      "2:198:20",
      "2:258:43",
      "4:37:15",
      "7:43:23",
      "7:176:13",
      "9:78:11",
      "22:78:40",
      "23:46:7",
      "53:54:3",
      "66:2:8",
      "89:16:10"
    ],
    "ZAY_JAWAZ": [
      "10:23:18",
      "11:91:14",
      "12:21:19",
      "18:62:6",
      "20:121:11",
      "28:25:5",
      "28:26:4",
      "33:53:33",
      "48:29:18",
      "4:171:25",
      "5:7:12",
      "6:165:18",
      "7:157:12",
      "37:75:5",
      "4:121:3"
    ],
    "QAD_QILA": [
      "59:2:28",
      "59:2:37",
      "59:7:27"
    ],
    "SAD_RUKHSA": [
      "16:28:5",
      "2:144:9",
      "2:282:110",
      "5:46:12",
      "6:71:23",
      "79:29:4",
      "79:31:4"
    ]
  },
  "excls": {
    "TA_MUTLAQ": [
      "11:49:16",
      "14:9:13",
      "33:13:18",
      "3:172:9",
      "47:4:21"
    ],
    "QIF": [
      "14:27:14",
      "16:70:4",
      "26:209:1",
      "27:40:23",
      "2:251:3",
      "2:256:4",
      "40:70:7",
      "6:19:7",
      "74:40:2",
      "7:128:9",
      "97:5:1",
      "9:101:8"
    ],
    "JEEM": [
      "10:109:8",
      "11:31:27",
      "12:29:6",
      "13:39:5",
      "21:32:4",
      "22:24:5",
      "23:24:20",
      "25:32:10",
      "25:59:13",
      "26:154:5",
      "28:35:10",
      "29:41:9",
      "29:66:3",
      "2:109:11",
      "2:133:24",
      "2:14:6",
      "2:174:26",
      "2:180:9",
      "2:195:9",
      "2:221:28",
      "2:236:13",
      "2:240:5",
      "2:24:11",
      "2:266:23",
      "2:2:4",
      "2:76:6",
      "2:89:16",
      "2:96:5",
      "30:7:5",
      "33:13:21",
      "33:19:2",
      "33:44:4",
      "33:61:1",
      "34:31:18",
      "36:33:4",
      "36:37:3",
      "38:5:4",
      "38:6:8",
      "38:7:6",
      "3:118:19",
      "3:167:3",
      "3:181:18",
      "3:30:9",
      "3:49:10",
      "40:64:17",
      "42:31:5",
      "44:45:1",
      "44:49:1",
      "46:17:22",
      "47:26:12",
      "48:12:17",
      "48:23:7",
      "4:75:26",
      "50:16:8",
      "5:32:3",
      "5:41:19",
      "5:41:62",
      "60:3:7",
      "65:10:9",
      "67:9:12",
      "68:41:3",
      "78:40:4",
      "7:163:23",
      "7:167:16",
      "7:172:16",
      "7:188:18",
      "7:92:7",
      "84:15:1",
      "9:17:14"
    ],
    "ZAY_JAWAZ": [
      "11:16:8",
      "19:48:8",
      "21:45:4",
      "21:56:8",
      "21:92:5",
      "25:50:4",
      "27:20:7",
      "29:60:9",
      "2:168:8",
      "33:23:15",
      "35:13:11",
      "35:3:19",
      "35:8:15",
      "42:6:8",
      "46:23:5",
      "46:26:11",
      "4:140:22",
      "4:141:13",
      "5:107:22",
      "5:22:6",
      "6:141:25",
      "6:146:26",
      "73:20:48",
      "7:144:8",
      "7:150:30",
      "7:151:8",
      "7:154:7",
      "7:179:7",
      "7:196:6",
      "7:83:4",
      "8:69:5",
      "9:129:5",
      "9:52:18"
    ],
    "QAD_QILA": [
      "12:3:10",
      "13:35:16",
      "14:40:6",
      "17:73:10",
      "17:79:6",
      "18:18:4",
      "18:18:9",
      "18:64:5",
      "18:82:21",
      "19:19:5",
      "19:6:5",
      "21:17:8",
      "21:3:4",
      "21:3:6",
      "21:63:3",
      "21:87:19",
      "22:17:10",
      "22:36:9",
      "23:17:5",
      "23:18:8",
      "23:67:1",
      "23:72:6",
      "24:15:12",
      "24:16:11",
      "24:33:21",
      "25:65:7",
      "26:35:6",
      "28:19:18",
      "28:9:9",
      "29:46:8",
      "29:60:6",
      "2:101:15",
      "2:20:9",
      "2:25:31",
      "30:25:11",
      "30:25:13",
      "30:30:17",
      "31:6:12",
      "35:12:3",
      "36:47:18",
      "37:31:4",
      "38:65:4",
      "39:23:7",
      "39:67:5",
      "39:8:30",
      "3:119:12",
      "3:173:12",
      "3:193:10",
      "3:45:9",
      "3:98:7",
      "40:28:3",
      "40:81:2",
      "42:10:13",
      "43:81:5",
      "46:12:14",
      "46:17:18",
      "47:35:5",
      "47:35:7",
      "47:4:11",
      "4:101:11",
      "4:143:2",
      "4:62:10",
      "50:38:9",
      "57:19:7",
      "58:1:11",
      "5:20:15",
      "60:1:32",
      "60:1:35",
      "6:138:5",
      "6:70:16",
      "76:2:6",
      "77:23:1",
      "7:11:9",
      "8:67:14"
    ],
    "SAD_RUKHSA": [
      "24:22:15",
      "24:37:13",
      "55:11:2",
      "91:14:2"
    ]
  },
  "cr": {
    "6:124:13": "TA_MUTLAQ",
    "67:19:7": "TA_MUTLAQ",
    "2:34:10": "QAD_QILA",
    "3:187:11": "QAD_QILA",
    "4:45:6": "QAD_QILA",
    "28:15:11": "QAD_QILA",
    "28:15:29": "QAD_QILA",
    "29:32:13": "QAD_QILA",
    "78:38:5": "CONFIRMED_EXCLUDED",
    "11:46:10": "CONFIRMED_EXCLUDED",
    "51:54:5": "CONFIRMED_EXCLUDED",
    "7:183:2": "QIF",
    "19:30:4": "QIF",
    "24:58:27": "QIF",
    "32:24:7": "QIF",
    "88:21:1": "QIF",
    "3:135:16": "SAD_RUKHSA",
    "19:17:4": "SAD_RUKHSA",
    "27:66:10": "ZAY_JAWAZ",
    "65:10:11": "QIF",
    "47:4:20": "JEEM",
    "4:103:9": "JEEM",
    "10:98:9": "JEEM",
    "2:62:18": "SAD_RUKHSA",
    "9:30:21": "ZAY_JAWAZ",
    "40:62:10": "ZAY_JAWAZ",
    "44:20:6": "ZAY_JAWAZ",
    "18:21:13": "QAD_QILA",
    "18:27:10": "JEEM",
    "19:1:1": "JEEM",
    "22:11:18": "JEEM",
    "50:1:1": "JEEM",
    "3:119:12": "CONFIRMED_EXCLUDED"
  },
  "pos_counts": {
    "TA_MUTLAQ": 3292,
    "QIF": 120,
    "JEEM": 1603,
    "ZAY_JAWAZ": 224,
    "QAD_QILA": 138,
    "SAD_RUKHSA": 146
  },
  "rev_counts": {
    "TA_MUTLAQ": 170,
    "QIF": 11,
    "JEEM": 72,
    "ZAY_JAWAZ": 18,
    "QAD_QILA": 6,
    "SAD_RUKHSA": 20
  },
  "class_map": {
    "TA_MUTLAQ": "has-default-waqf",
    "QIF": "has-default-qif",
    "JEEM": "has-default-jeem",
    "ZAY_JAWAZ": "has-default-zay-jawaz",
    "QAD_QILA": "has-default-qad-qila",
    "SAD_RUKHSA": "has-default-sad-rukhsa"
  },
  "samples": {
    "TA_MUTLAQ": [
      "1:4:3",
      "1:5:4",
      "2:4:12",
      "2:7:6",
      "2:9:10"
    ],
    "QIF": [
      "2:83:9",
      "2:157:6",
      "2:196:35",
      "2:213:4",
      "2:243:15"
    ],
    "JEEM": [
      "2:1:1",
      "2:2:5",
      "2:4:9",
      "2:9:4",
      "2:10:6"
    ],
    "ZAY_JAWAZ": [
      "2:7:9",
      "2:34:10",
      "2:41:16",
      "2:85:10",
      "2:86:6"
    ],
    "QAD_QILA": [
      "2:5:5",
      "2:29:8",
      "2:34:10",
      "2:61:40",
      "2:79:5"
    ],
    "SAD_RUKHSA": [
      "2:16:5",
      "2:22:7",
      "2:23:12",
      "2:27:7",
      "2:35:11"
    ]
  }
}
;

const TYPES = ['TA_MUTLAQ','QIF','JEEM','ZAY_JAWAZ','QAD_QILA','SAD_RUKHSA'];
const RANK = { TA_MUTLAQ:0, QIF:1, JEEM:2, ZAY_JAWAZ:3, QAD_QILA:4, SAD_RUKHSA:5 };

console.log('\n=== FREEZE: source counts ===');
const posMatch = waqfPositionsSrc.match(/window\.WAQF_POSITIONS\s*=\s*(\[[\s\S]*?\]);/);
const revMatch = waqfPositionsSrc.match(/window\.WAQF_REVIEW\s*=\s*(\[[\s\S]*?\]);/);
const POS = JSON.parse(posMatch[1]);
const REV = JSON.parse(revMatch[1]);
TYPES.forEach(function (t) {
  const n = POS.filter(function (p) { return p.type === t; }).length;
  check('POSITIONS count ' + t + ' === ' + FROZEN.pos_counts[t], n === FROZEN.pos_counts[t], 'got ' + n);
  const nr = REV.filter(function (p) { return p.type === t; }).length;
  check('REVIEW count ' + t + ' === ' + FROZEN.rev_counts[t], nr === FROZEN.rev_counts[t], 'got ' + nr);
});

console.log('\n=== FREEZE: MANUAL_ADDITIONS set equality (from source) ===');
TYPES.forEach(function (t) {
  const re = new RegExp("'" + t + "':\\s*\\{");
  // Parse keys from readerManager for this type in ADDITIONS
  const idx = rmSrc.indexOf('var DEFAULT_MARK_MANUAL_ADDITIONS');
  const slice = rmSrc.slice(idx, idx + 150000);
  const m = slice.match(new RegExp("'" + t + "':\\s*\\{([\\s\\S]*?)\\n\\s*\\}"));
  // fallback: count keys
  const blockStart = slice.search(new RegExp("'" + t + "':\\s*\\{"));
  if (blockStart < 0) {
    check('ADDITIONS block exists for ' + t, FROZEN.adds[t].length === 0, 'missing block');
    return;
  }
  let depth = 0, end = -1;
  const from = slice.indexOf('{', blockStart);
  for (let i = from; i < slice.length; i++) {
    if (slice[i] === '{') depth++;
    else if (slice[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = slice.slice(blockStart, end + 1);
  const keys = block.match(/'(\d+:\d+:\d+)'/g) || [];
  const set = {};
  keys.forEach(function (k) { set[k.slice(1, -1)] = true; });
  const frozen = FROZEN.adds[t];
  const missing = frozen.filter(function (k) { return !set[k]; });
  const extra = Object.keys(set).filter(function (k) { return frozen.indexOf(k) === -1; });
  check('ADDITIONS[' + t + '] frozen set (' + frozen.length + ' keys)', missing.length === 0 && extra.length === 0,
    'missing=' + missing.join(',') + ' extra=' + extra.join(','));
});

console.log('\n=== FREEZE: MANUAL_EXCLUSIONS set equality ===');
TYPES.forEach(function (t) {
  const idx = rmSrc.indexOf('var DEFAULT_MARK_MANUAL_EXCLUSIONS');
  const slice = rmSrc.slice(idx, idx + 80000);
  const blockStart = slice.search(new RegExp("'" + t + "':\\s*\\{"));
  if (blockStart < 0) {
    check('EXCLUSIONS block exists for ' + t, FROZEN.excls[t].length === 0, 'missing');
    return;
  }
  let depth = 0, end = -1;
  const from = slice.indexOf('{', blockStart);
  for (let i = from; i < slice.length; i++) {
    if (slice[i] === '{') depth++;
    else if (slice[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = slice.slice(blockStart, end + 1);
  const keys = block.match(/'(\d+:\d+:\d+)'/g) || [];
  const set = {};
  keys.forEach(function (k) { set[k.slice(1, -1)] = true; });
  const frozen = FROZEN.excls[t];
  const missing = frozen.filter(function (k) { return !set[k]; });
  const extra = Object.keys(set).filter(function (k) { return frozen.indexOf(k) === -1; });
  check('EXCLUSIONS[' + t + '] frozen set (' + frozen.length + ' keys)', missing.length === 0 && extra.length === 0,
    'missing=' + missing.join(',') + ' extra=' + extra.join(','));
});

console.log('\n=== FREEZE: CONFLICT_RESOLUTIONS (final values) ===');
// Parse CR from DEFAULT_MARK_CONFLICT_RESOLUTIONS only (comments stripped)
(function () {
  const start = rmSrc.indexOf('var DEFAULT_MARK_CONFLICT_RESOLUTIONS');
  let slice = rmSrc.slice(start, start + 12000);
  slice = slice.replace(/\/\/[^\n]*/g, ''); // line comments
  const parsed = {};
  const re = /'(\d+:\d+:\d+)':\s*'(\w+)'/g;
  let m;
  while ((m = re.exec(slice)) !== null) parsed[m[1]] = m[2]; // last wins
  Object.keys(FROZEN.cr).forEach(function (key) {
    check('CR[' + key + '] === ' + FROZEN.cr[key], parsed[key] === FROZEN.cr[key], 'got ' + parsed[key]);
  });
})();

console.log('\n=== FREEZE: behavioural — every MANUAL_ADDITION colours correctly ===');
TYPES.forEach(function (t) {
  const cls = FROZEN.class_map[t];
  FROZEN.adds[t].forEach(function (key) {
    const parts = key.split(':').map(Number);
    const s = parts[0], a = parts[1], w = parts[2];
    // skip if CR redirects to another type
    const res = FROZEN.cr[key];
    if (res && res !== t && res !== 'CONFIRMED_EXCLUDED') {
      // addition present but CR picks other — OK if other class shows
      return;
    }
    if (res === 'CONFIRMED_EXCLUDED') return;
    if (FROZEN.excls[t].indexOf(key) !== -1) return;
    let ayah;
    try { ayah = getAyah(s, a); } catch (e) {
      check('ADD ' + key + ' ayah loadable', false, String(e));
      return;
    }
    // last-word policy: last word must NOT colour
    const nWords = ayah.text.split(/\s+/).length;
    const html = RM.renderAyahWords(ayah);
    const dk = wordKey(s, a, w);
    if (w === nWords) {
      check('ADD ' + key + ' last-word → no ' + cls, !hasClass(html, cls, dk), '');
      return;
    }
    check('ADD ' + key + ' carries ' + cls, hasClass(html, cls, dk), 'html snippet missing class');
  });
});

console.log('\n=== FREEZE: behavioural — every MANUAL_EXCLUSION has no colour for that type ===');
TYPES.forEach(function (t) {
  const cls = FROZEN.class_map[t];
  FROZEN.excls[t].forEach(function (key) {
    const parts = key.split(':').map(Number);
    const s = parts[0], a = parts[1], w = parts[2];
    let ayah;
    try { ayah = getAyah(s, a); } catch (e) {
      check('EXCL ' + key + ' ayah loadable', false, String(e));
      return;
    }
    const html = RM.renderAyahWords(ayah);
    const dk = wordKey(s, a, w);
    check('EXCL ' + key + ' does NOT carry ' + cls, !hasClass(html, cls, dk), '');
  });
});

console.log('\n=== FREEZE: behavioural — conflict resolutions ===');
Object.keys(FROZEN.cr).forEach(function (key) {
  const winner = FROZEN.cr[key];
  const parts = key.split(':').map(Number);
  const s = parts[0], a = parts[1], w = parts[2];
  let ayah;
  try { ayah = getAyah(s, a); } catch (e) {
    check('CR ' + key + ' ayah loadable', false, String(e));
    return;
  }
  const html = RM.renderAyahWords(ayah);
  const dk = wordKey(s, a, w);
  if (winner === 'CONFIRMED_EXCLUDED') {
    TYPES.forEach(function (t) {
      check('CR ' + key + ' EXCLUDED → no ' + FROZEN.class_map[t], !hasClass(html, FROZEN.class_map[t], dk), '');
    });
    return;
  }
  if (!FROZEN.class_map[winner]) {
    check('CR ' + key + ' known winner type', false, winner);
    return;
  }
  const nWords = ayah.text.split(/\s+/).length;
  const winCls = FROZEN.class_map[winner];
  if (w === nWords) {
    // last-word policy overrides colour even when CR names a winner
    check('CR ' + key + ' last-word → no colour', !hasClass(html, winCls, dk), '');
    return;
  }
  check('CR ' + key + ' → ' + winner + ' class', hasClass(html, winCls, dk), '');
  TYPES.forEach(function (t) {
    if (t === winner) return;
    check('CR ' + key + ' not ' + t, !hasClass(html, FROZEN.class_map[t], dk), '');
  });
});

console.log('\n=== FREEZE: weakest-wins structural check on CR ===');
// For each CR where winner is a ranked type, winner must be the weakest among
// POSITIONS types on that word (approximation: if multiple types in POS for word)
const byWord = {};
POS.forEach(function (p) {
  if (TYPES.indexOf(p.type) === -1) return;
  const k = p.surah + ':' + p.ayah + ':' + p.word;
  if (!byWord[k]) byWord[k] = [];
  byWord[k].push(p.type);
});
Object.keys(FROZEN.cr).forEach(function (key) {
  const winner = FROZEN.cr[key];
  if (winner === 'CONFIRMED_EXCLUDED' || RANK[winner] === undefined) return;
  const types = byWord[key] || [];
  if (types.length < 2) return;
  const ranked = types.filter(function (t) { return RANK[t] !== undefined; })
    .sort(function (a, b) { return RANK[a] - RANK[b]; });
  const weakest = ranked[ranked.length - 1];
  check('weakest-wins CR[' + key + '] is ' + weakest, winner === weakest,
    'CR=' + winner + ' types=' + types.join(','));
});

console.log('\n=== FREEZE: last-word policy sample (known POSITIONS last words must not colour) ===');
// sample: for each type, find a few last-word POSITIONS
TYPES.forEach(function (t) {
  let checked = 0;
  for (let i = 0; i < POS.length && checked < 3; i++) {
    const p = POS[i];
    if (p.type !== t) continue;
    let ayah;
    try { ayah = getAyah(p.surah, p.ayah); } catch (e) { continue; }
    const n = ayah.text.split(/\s+/).length;
    if (p.word !== n) continue;
    const html = RM.renderAyahWords(ayah);
    const dk = wordKey(p.surah, p.ayah, p.word);
    check('last-word ' + p.surah + ':' + p.ayah + ':' + p.word + ' (' + t + ') no colour',
      !hasClass(html, FROZEN.class_map[t], dk), '');
    checked++;
  }
});

console.log('\n=== FREEZE: Indopak never receives default stop-mark classes ===');
(function () {
  const ayah = getAyah(2, 7);
  // switch font
  const RMi = loadRM();
  // re-init with indopak - need state.fontStyle
  const warnings = [];
  const sandbox = {
    console: { warn: function (msg) { warnings.push(msg); }, log: function(){}, error: console.error },
    document: { addEventListener: function () {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(waqfPositionsSrc, sandbox);
  vm.runInContext(rmSrc, sandbox);
  sandbox.window.ReaderManager.init({
    PAGES: [], JUZ_INFO: [], state: { fontStyle: 'indopak' }, els: {},
    toArabicDigits: function (n) { return String(n); },
    REMINDER_COLORS: {}, getWaqfMarks: function () { return {}; },
    showReader: function () {}, onBeforePageChange: function () {},
    onPageChanged: function () {}, onAfterRender: function () {}
  });
  const html = sandbox.window.ReaderManager.renderAyahWords(ayah);
  TYPES.forEach(function (t) {
    check('Indopak 2:7 has no ' + FROZEN.class_map[t], html.indexOf(FROZEN.class_map[t]) === -1, '');
  });
})();

console.log('\n=== FREEZE SUMMARY ===');
console.log(passed + ' passed, ' + failed + ' failed.');
process.exit(failed ? 1 : 0);
