// tests/parse.test.js
// Tests for parseDollarsToCents and parsePercentToBps. Run them with: npm test
//
// The expected answers are written out by hand, plus one round-trip rule
// that must hold for every amount: format a number of cents as text,
// parse the text, and you must get the same number of cents back.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDollarsToCents, parsePercentToBps } from "../parse.js";

// ---- Small helpers ----

// Checks that parsing worked and gave the expected whole number.
function assertValue(result, expected) {
  assert.deepEqual(result, { ok: true, value: expected });
}

// Checks that parsing failed with the expected message.
function assertMessage(result, expected) {
  assert.deepEqual(result, { ok: false, message: expected });
}

// Writes a number of cents as "D.CC" using only whole-number math.
// Example: 125050 -> "1250.50", 7 -> "0.07".
function formatCents(cents) {
  const dollars = Math.floor(cents / 100);
  const leftoverCents = cents % 100;
  return `${dollars}.${String(leftoverCents).padStart(2, "0")}`;
}

// ---- Dollars: valid input ----

test("dollars: the examples from the spec", () => {
  assertValue(parseDollarsToCents("1250.50"), 125050);
  assertValue(parseDollarsToCents("$1,250.50"), 125050);
  assertValue(parseDollarsToCents(" 1250 "), 125000);
  assertValue(parseDollarsToCents("1250.5"), 125050);
});

test("dollars: zero, small amounts, and thousands separators", () => {
  assertValue(parseDollarsToCents("0"), 0);
  assertValue(parseDollarsToCents("0.00"), 0);
  assertValue(parseDollarsToCents("0.07"), 7);
  assertValue(parseDollarsToCents("$5"), 500);
  assertValue(parseDollarsToCents("1,250"), 125000);
  assertValue(parseDollarsToCents("1,000,000"), 100000000);
  assertValue(parseDollarsToCents("007"), 700); // leading zeros are fine
  assertValue(parseDollarsToCents("\t$12.34\n"), 1234); // any outer whitespace
});

// ---- Dollars: rejected input ----

test("dollars: empty or missing input is rejected", () => {
  assertMessage(parseDollarsToCents(""), "Enter a number");
  assertMessage(parseDollarsToCents("   "), "Enter a number");
  assertMessage(parseDollarsToCents("$"), "Enter a number");
  assertMessage(parseDollarsToCents(undefined), "Enter an amount");
  assertMessage(parseDollarsToCents(12.5), "Enter an amount"); // must be text
});

test("dollars: negative numbers are rejected", () => {
  assertMessage(parseDollarsToCents("-5"), "Enter a number that is 0 or more");
  assertMessage(parseDollarsToCents("$-5"), "Enter a number that is 0 or more");
  assertMessage(parseDollarsToCents("-$5"), "Enter a number that is 0 or more");
});

test("dollars: badly placed decimal points are rejected", () => {
  assertMessage(parseDollarsToCents("1.2.3"), "Use only one decimal point");
  assertMessage(parseDollarsToCents("."), "Put a digit before the decimal point, like 0.5");
  assertMessage(parseDollarsToCents(".5"), "Put a digit before the decimal point, like 0.5");
  assertMessage(parseDollarsToCents("1."), "Put a digit after the decimal point, like 1.0");
});

test("dollars: more than 2 decimal places is rejected", () => {
  assertMessage(parseDollarsToCents("1.005"), "Use at most 2 decimal places");
  assertMessage(parseDollarsToCents("1250.500"), "Use at most 2 decimal places");
});

test("dollars: commas must be thousands separators", () => {
  const message = "Put commas only between groups of 3 digits, like 1,250";
  assertMessage(parseDollarsToCents("12,50"), message);
  assertMessage(parseDollarsToCents("1,2500"), message);
  assertMessage(parseDollarsToCents(",250"), message);
  assertMessage(parseDollarsToCents("1,250,"), message);
  assertMessage(parseDollarsToCents("1,,250"), message);
  // A comma after the decimal point is not allowed either.
  assertMessage(parseDollarsToCents("1.2,5"), "Use only digits, commas, and one decimal point");
});

test("dollars: other characters are rejected", () => {
  const message = "Use only digits, commas, and one decimal point";
  assertMessage(parseDollarsToCents("abc"), message);
  assertMessage(parseDollarsToCents("12a"), message);
  assertMessage(parseDollarsToCents("1.5a"), message);
  assertMessage(parseDollarsToCents("1 250"), message); // space in the middle
  assertMessage(parseDollarsToCents("$$5"), message); // only one "$"
  assertMessage(parseDollarsToCents("5$"), message); // "$" goes at the start
  assertMessage(parseDollarsToCents("5%"), message);
  assertMessage(parseDollarsToCents("1e3"), message);
  assertMessage(parseDollarsToCents("+5"), message);
  assertMessage(parseDollarsToCents("Infinity"), message);
});

test("dollars: the cap is $10,000,000.00", () => {
  assertValue(parseDollarsToCents("$10,000,000.00"), 1000000000);
  assertValue(parseDollarsToCents("9999999.99"), 999999999);
  assertMessage(parseDollarsToCents("10000000.01"), "Enter $10,000,000.00 or less");
  assertMessage(parseDollarsToCents("99999999999999999999999999"), "Enter $10,000,000.00 or less");
});

// ---- Percent: valid input ----

test("percent: the examples from the spec", () => {
  assertValue(parsePercentToBps("24.99"), 2499);
  assertValue(parsePercentToBps("24.99%"), 2499);
  assertValue(parsePercentToBps("18"), 1800);
  assertValue(parsePercentToBps("0"), 0);
});

test("percent: one decimal place, spaces, and small rates", () => {
  assertValue(parsePercentToBps("19.9"), 1990);
  assertValue(parsePercentToBps(" 18% "), 1800);
  assertValue(parsePercentToBps("0.01"), 1); // 1 basis point
});

// ---- Percent: rejected input ----

test("percent: empty, negative, and badly formed input is rejected", () => {
  assertMessage(parsePercentToBps(""), "Enter a number");
  assertMessage(parsePercentToBps("%"), "Enter a number");
  assertMessage(parsePercentToBps(null), "Enter a rate");
  assertMessage(parsePercentToBps("-1"), "Enter a number that is 0 or more");
  assertMessage(parsePercentToBps("1.2.3"), "Use only one decimal point");
  assertMessage(parsePercentToBps(".5"), "Put a digit before the decimal point, like 0.5");
  assertMessage(parsePercentToBps("1."), "Put a digit after the decimal point, like 1.0");
});

test("percent: more than 2 decimal places is rejected (basis points cannot hold them)", () => {
  assertMessage(parsePercentToBps("24.999"), "Use at most 2 decimal places");
  assertMessage(parsePercentToBps("0.001%"), "Use at most 2 decimal places");
});

test("percent: other characters are rejected", () => {
  const message = "Use only digits, commas, and one decimal point";
  assertMessage(parsePercentToBps("abc"), message);
  assertMessage(parsePercentToBps("5%%"), message); // only one "%"
  assertMessage(parsePercentToBps("%5"), message); // "%" goes at the end
  assertMessage(parsePercentToBps("$5"), message);
  assertMessage(parsePercentToBps("18 %"), message); // space before "%"
});

test("percent: the cap is 100.00%", () => {
  assertValue(parsePercentToBps("100"), 10000);
  assertValue(parsePercentToBps("100.00%"), 10000);
  assertMessage(parsePercentToBps("100.01"), "Enter 100% or less");
  assertMessage(parsePercentToBps("1,000"), "Enter 100% or less");
});

// ---- Round trip: format, then parse, gives the same number back ----

test("round trip: every cents value from 0 to 100000 parses back to itself", () => {
  for (let cents = 0; cents <= 100000; cents++) {
    const result = parseDollarsToCents(formatCents(cents));
    // Compare by hand instead of assert.deepEqual, because 100,001 calls
    // to deepEqual would make this test slow.
    if (!result.ok || result.value !== cents) {
      assert.fail(`"${formatCents(cents)}" gave ${JSON.stringify(result)}, expected ${cents}`);
    }
  }
});

test("round trip: large cents values up to the cap parse back to themselves", () => {
  // Every 9,973rd value (an odd step so the cents part keeps changing), plus the cap.
  const samples = [1000000000];
  for (let cents = 0; cents <= 1000000000; cents += 9973) {
    samples.push(cents);
  }
  for (const cents of samples) {
    const result = parseDollarsToCents("$" + formatCents(cents));
    if (!result.ok || result.value !== cents) {
      assert.fail(`"${formatCents(cents)}" gave ${JSON.stringify(result)}, expected ${cents}`);
    }
  }
});

test("round trip: every basis point value from 0 to 10000 parses back to itself", () => {
  for (let bps = 0; bps <= 10000; bps++) {
    // Basis points are hundredths of a percent, so the same "D.CC" format works.
    const text = formatCents(bps) + "%";
    const result = parsePercentToBps(text);
    if (!result.ok || result.value !== bps) {
      assert.fail(`"${text}" gave ${JSON.stringify(result)}, expected ${bps}`);
    }
  }
});

// ---- The floating point trap this parser avoids ----

test("float trap: parseFloat times 100 is not exact, the string parser is", () => {
  // 4.35 cannot be stored exactly as a decimal number in JavaScript.
  assert.equal(parseFloat("4.35") * 100, 434.99999999999994);
  // So code that cuts off the decimals gets the wrong number of cents.
  assert.equal(Math.floor(parseFloat("4.35") * 100), 434);
  // Rounding does not fix every case: 1.005 should round to 101 cents,
  // but parseFloat("1.005") * 100 is 100.49999999999999, which rounds to 100.
  assert.equal(Math.round(parseFloat("1.005") * 100), 100);

  // The string parser builds the answer from the digits, so it is exact.
  assertValue(parseDollarsToCents("4.35"), 435);
  // And it refuses "1.005" instead of silently guessing.
  assertMessage(parseDollarsToCents("1.005"), "Use at most 2 decimal places");
});
