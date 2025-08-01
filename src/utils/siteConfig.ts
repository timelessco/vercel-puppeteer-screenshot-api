export const SITE_NAME = "Vercel Puppeteer screenshot API";
export const SITE_DESCRIPTION =
	"Vercel function for screenshoting URLs using headless browsers";
export const SITE_EMAIL = "hello@timeless.co";
export const SITE_PHONE_NUMBER = "+91 9688888222";
export const SITE_AUTHOR = "Timeless Team";
export const SITE_SOCIAL_MEDIA_LINKS = {
	github: "https://github.com/timelessco",
	twitter: "https://twitter.com/timelessco",
} as const;
export const SITE_SOCIAL_MEDIA_IDS = {
	twitter: "@timelessco",
} as const;

const productionUrl =
	process.env.NEXT_PUBLIC_SITE_URL ??
	`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
const vercelUrl =
	process.env.VERCEL_ENV === "preview" ||
	process.env.VERCEL_ENV === "development"
		? `https://${process.env.VERCEL_BRANCH_URL}`
		: productionUrl;
export const BASE_URL =
	process.env.NODE_ENV === "development"
		? `http://localhost:${process.env.PORT ?? 3000}`
		: vercelUrl;

// Services Offered
export const SERVICES_OFFERED = [
	"react",
	"typescript",
	"nextjs",
	"tailwindcss",
] as const;
