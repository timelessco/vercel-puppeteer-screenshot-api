import { type KnipConfig } from "knip";

const config: KnipConfig = {
	entry: ["src/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}!"],
	exclude: ["types"],
	ignore: [],
	ignoreBinaries: [
		"lint-staged",
		"markdownlint",
		"eslint",
		"commitlint",
		"prettier",
	],
	// "puppeteer-core" - Needed for Rebrowser during build to disable errors
	// "@duckduckgo/autoconsent" - Needed for cookie consent handling dynamically imported
	ignoreDependencies: ["puppeteer-core", "@duckduckgo/autoconsent"],
	include: ["nsExports"],
	project: [
		"src/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}!",
		"**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
	],
};

export default config;
