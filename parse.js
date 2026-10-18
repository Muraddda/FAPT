// parse.js
// Turns text typed into a form into the whole-number units that payoff.js uses.
//
//   parseDollarsToCents("$1,250.50") -> { ok: true, value: 125050 }
//   parsePercentToBps("24.99%")      -> { ok: true, value: 2499 }
//   parsePercentToBps("24.999")      -> { ok: false, message: "Use at most 2 decimal places" }
//
// Why we never use parseFloat or Number on a decimal value:
// computers store decimals like 4.35 only approximately. In JavaScript,
// parseFloat("4.35") * 100 is 434.99999999999994, not 435. So instead we treat
// the input as text, split it at the decimal point, check each part, and build
// the whole number from the parts using only whole-number math.
//
// Every function returns one of two shapes:
//   { ok: true, value: <whole number> }
//   { ok: false, message: <short text to show next to the form field> }

// Largest balance we accept: $10,000,000.00, which is 1,000,000,000 cents.
// This is far below Number.MAX_SAFE_INTEGER (about 9,000,000,000,000,000),
// so every result is an exact whole number.
const MAX_CENTS = 1000000000;

// Largest APR we accept: 100.00%, which is 10,000 basis points.
const MAX_BPS = 10000;

// Regular expressions used below. "^" means "start of the text" and "$" means
// "end of the text", so each one must match the WHOLE text, not just part of it.
//
// ONLY_DIGITS: one or more of the characters 0-9 and nothing else. Example: "1250".
const ONLY_DIGITS = /^[0-9]+$/;
//
// DIGITS_AND_COMMAS: one or more characters that are each a digit or a comma.
const DIGITS_AND_COMMAS = /^[0-9,]+$/;
//
// THOUSANDS_GROUPS: 1 to 3 digits, then one or more groups of
// "a comma followed by exactly 3 digits". Examples: "1,250" and "10,000,000"
// match; "12,50" and "1,2500" and ",250" do not.
const THOUSANDS_GROUPS = /^[0-9]{1,3}(,[0-9]{3})+$/;

// "1250.50", "$1,250.50", " 1250 " or "1250.5" -> 125050 cents (or 125000 for 1250).
export function parseDollarsToCents(text) {
  if (typeof text !== "string") {
    return fail("Enter an amount");
  }

  // Ignore spaces at the start and end.
  let body = text.trim();

  // Allow one "$" at the very start.
  if (body.startsWith("$")) {
    body = body.slice(1);
  }

  const result = parseHundredths(body);
  if (!result.ok) {
    return result;
  }
  if (result.value > MAX_CENTS) {
    return fail("Enter $10,000,000.00 or less");
  }
  // A dollar amount with 2 decimal places is a whole number of cents.
  return result;
}

// "24.99", "24.99%", "18" or "0" -> 2499, 2499, 1800 or 0 basis points.
export function parsePercentToBps(text) {
  if (typeof text !== "string") {
    return fail("Enter a rate");
  }

  // Ignore spaces at the start and end.
  let body = text.trim();

  // Allow one "%" at the very end.
  if (body.endsWith("%")) {
    body = body.slice(0, -1);
  }

  const result = parseHundredths(body);
  if (!result.ok) {
    return result;
  }
  if (result.value > MAX_BPS) {
    return fail("Enter 100% or less");
  }
  // A percent with 2 decimal places is a whole number of basis points,
  // because 1 basis point is 0.01%.
  return result;
}

// Shared by both functions above. Reads a plain number with at most
// 2 decimal places (like "1,250.5") and returns it in hundredths (125050).
// The "$" or "%" has already been removed by the caller.
function parseHundredths(body) {
  if (body === "") {
    return fail("Enter a number");
  }
  if (body.includes("-")) {
    return fail("Enter a number that is 0 or more");
  }

  // Split at the decimal point: "1,250.5" -> ["1,250", "5"].
  const parts = body.split(".");
  if (parts.length > 2) {
    return fail("Use only one decimal point");
  }
  const wholeText = parts[0];
  const hasDecimalPoint = parts.length === 2;
  // If there was no decimal point, there are no decimal digits.
  const fractionText = hasDecimalPoint ? parts[1] : "";

  // Check the part before the decimal point.
  if (wholeText === "") {
    return fail("Put a digit before the decimal point, like 0.5");
  }
  if (!DIGITS_AND_COMMAS.test(wholeText)) {
    return fail("Use only digits, commas, and one decimal point");
  }
  if (wholeText.includes(",") && !THOUSANDS_GROUPS.test(wholeText)) {
    return fail("Put commas only between groups of 3 digits, like 1,250");
  }

  // Check the part after the decimal point.
  if (hasDecimalPoint && fractionText === "") {
    return fail("Put a digit after the decimal point, like 1.0");
  }
  if (hasDecimalPoint && !ONLY_DIGITS.test(fractionText)) {
    return fail("Use only digits, commas, and one decimal point");
  }
  if (fractionText.length > 2) {
    return fail("Use at most 2 decimal places");
  }

  // Build the whole number. Both texts now contain only the digits 0-9,
  // so Number() reads them as exact whole numbers, never as decimals.
  // Example: "1,250" and "5" -> 1250 and 50 -> 1250 * 100 + 50 = 125050.
  const wholeDigits = wholeText.replaceAll(",", ""); // "1,250" -> "1250"
  const fractionDigits = fractionText.padEnd(2, "0"); // "5" -> "50", "" -> "00"
  const value = Number(wholeDigits) * 100 + Number(fractionDigits);
  // Note: an absurdly long input (like 25 digits) would not be exact here,
  // but it is always far above MAX_CENTS and MAX_BPS, so the caller rejects it.

  return { ok: true, value: value };
}

// Builds the "it did not work" result.
function fail(message) {
  return { ok: false, message: message };
}
