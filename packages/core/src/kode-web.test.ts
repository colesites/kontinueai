import { describe, expect, test } from "bun:test";
import { getKodeWebCreditCharge, KODE_WEB_TOKENS_PER_CREDIT } from "./kode-web";

describe("Kode Web credits", () => {
	test("charges one credit for up to 25,000 tokens", () => {
		expect(getKodeWebCreditCharge(0)).toBe(1);
		expect(getKodeWebCreditCharge(KODE_WEB_TOKENS_PER_CREDIT)).toBe(1);
	});

	test("rounds partial token blocks up", () => {
		expect(getKodeWebCreditCharge(KODE_WEB_TOKENS_PER_CREDIT + 1)).toBe(2);
		expect(getKodeWebCreditCharge(KODE_WEB_TOKENS_PER_CREDIT * 4)).toBe(4);
	});
});
