export const localExecutablePath =
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "linux"
    ? "/usr/bin/google-chrome"
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const remoteExecutablePath =
  "https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar";

export const isDev = process.env.NODE_ENV === "development";

export const userAgent =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36";

export const videoUrlRegex = /\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv|mpg|mpeg|m2v|divx|xvid|rm|rmvb|asf|ts|mts|vob)(\?.*)?$/i;

export const X = "x.com"
export const INSTAGRAM = "instagram.com"
export const YOUTUBE = "youtube.com"
export const TWITTER = "twitter.com"

