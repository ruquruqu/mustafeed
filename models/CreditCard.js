'use strict';

/**
 * Card networks recognised by the model, with their number-prefix patterns,
 * accepted number lengths and CVV length.
 */
const BRANDS = {
  visa:       { pattern: /^4/,                                lengths: [13, 16, 19],  cvvLength: 3 },
  mastercard: { pattern: /^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/, lengths: [16], cvvLength: 3 },
  amex:       { pattern: /^3[47]/,                            lengths: [15],          cvvLength: 4 },
  discover:   { pattern: /^(6011|65|64[4-9])/,                lengths: [16, 19],      cvvLength: 3 },
  diners:     { pattern: /^(36|38|30[0-5])/,                  lengths: [14, 16, 19],  cvvLength: 3 },
  jcb:        { pattern: /^35(2[89]|[3-8])/,                  lengths: [16, 17, 18, 19], cvvLength: 3 },
  unknown:    { pattern: /.*/,                                lengths: [12, 13, 14, 15, 16, 17, 18, 19], cvvLength: 3 },
};

const STATUSES = ['active', 'inactive', 'blocked', 'expired'];
const TYPES = ['credit', 'debit', 'prepaid'];

function digitsOnly(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

/** Luhn (mod 10) checksum used by all major card networks. */
function luhnCheck(number) {
  if (!/^\d+$/.test(number)) return false;
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = number.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function detectBrand(number) {
  for (const [name, def] of Object.entries(BRANDS)) {
    if (name === 'unknown') continue;
    if (def.pattern.test(number)) return name;
  }
  return 'unknown';
}

class CreditCard {
  /**
   * @param {object} data
   * @param {string} data.cardNumber      Full PAN; spaces and dashes are stripped.
   * @param {string} data.cardholderName  Name as printed on the card.
   * @param {number} data.expiryMonth     1-12.
   * @param {number} data.expiryYear      Four-digit year (two-digit years are treated as 20xx).
   * @param {string} [data.cvv]           Kept in memory only; never serialised.
   * @param {string} [data.type]          'credit' | 'debit' | 'prepaid'.
   * @param {string} [data.status]        'active' | 'inactive' | 'blocked' | 'expired'.
   * @param {string} [data.id]
   * @param {string} [data.issuer]        Issuing bank name.
   * @param {object} [data.billingAddress] { line1, line2, city, state, postalCode, country }
   * @param {boolean} [data.isDefault]
   */
  constructor(data = {}) {
    this.id = data.id ?? null;
    this.cardNumber = digitsOnly(data.cardNumber);
    this.cardholderName = String(data.cardholderName ?? '').trim();
    this.expiryMonth = Number(data.expiryMonth);
    this.expiryYear = CreditCard.normalizeYear(data.expiryYear);
    this.type = data.type ?? 'credit';
    this.status = data.status ?? 'active';
    this.issuer = data.issuer ?? null;
    this.billingAddress = data.billingAddress ?? null;
    this.isDefault = Boolean(data.isDefault);
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();

    // Non-enumerable so it never leaks through spreading, JSON.stringify or console.log.
    Object.defineProperty(this, 'cvv', {
      value: data.cvv != null ? String(data.cvv).trim() : null,
      writable: true,
      enumerable: false,
    });
  }

  static normalizeYear(year) {
    const y = Number(year);
    return Number.isInteger(y) && y >= 0 && y < 100 ? 2000 + y : y;
  }

  get brand() {
    return detectBrand(this.cardNumber);
  }

  get last4() {
    return this.cardNumber.slice(-4);
  }

  /** e.g. "**** **** **** 1234" (Amex: "**** ****** *1234"). */
  get maskedNumber() {
    const masked = '*'.repeat(Math.max(0, this.cardNumber.length - 4)) + this.last4;
    return CreditCard.formatNumber(masked, this.brand);
  }

  /** "MM/YY" */
  get expiry() {
    const mm = String(this.expiryMonth).padStart(2, '0');
    const yy = String(this.expiryYear % 100).padStart(2, '0');
    return `${mm}/${yy}`;
  }

  /** Cards are valid through the last day of the expiry month. */
  isExpired(now = new Date()) {
    const endOfMonth = new Date(this.expiryYear, this.expiryMonth, 1); // first day of the following month
    return now >= endOfMonth;
  }

  static formatNumber(number, brand = detectBrand(number)) {
    if (brand === 'amex') {
      return [number.slice(0, 4), number.slice(4, 10), number.slice(10)].filter(Boolean).join(' ');
    }
    return number.match(/.{1,4}/g)?.join(' ') ?? '';
  }

  /** @returns {{ valid: boolean, errors: Record<string, string> }} */
  validate(now = new Date()) {
    const errors = {};
    const brandDef = BRANDS[this.brand];

    if (!/^\d+$/.test(this.cardNumber)) {
      errors.cardNumber = 'Card number must contain only digits';
    } else if (!brandDef.lengths.includes(this.cardNumber.length)) {
      errors.cardNumber = `Invalid card number length for ${this.brand}`;
    } else if (!luhnCheck(this.cardNumber)) {
      errors.cardNumber = 'Card number failed checksum';
    }

    if (!this.cardholderName) {
      errors.cardholderName = 'Cardholder name is required';
    } else if (!/^[\p{L}\s.'-]{2,100}$/u.test(this.cardholderName)) {
      errors.cardholderName = 'Cardholder name contains invalid characters';
    }

    if (!Number.isInteger(this.expiryMonth) || this.expiryMonth < 1 || this.expiryMonth > 12) {
      errors.expiryMonth = 'Expiry month must be between 1 and 12';
    }
    if (!Number.isInteger(this.expiryYear)) {
      errors.expiryYear = 'Expiry year is required';
    } else if (!errors.expiryMonth && this.isExpired(now)) {
      errors.expiry = 'Card has expired';
    }

    if (this.cvv != null && !new RegExp(`^\\d{${brandDef.cvvLength}}$`).test(this.cvv)) {
      errors.cvv = `CVV must be ${brandDef.cvvLength} digits`;
    }

    if (!TYPES.includes(this.type)) errors.type = `Type must be one of: ${TYPES.join(', ')}`;
    if (!STATUSES.includes(this.status)) errors.status = `Status must be one of: ${STATUSES.join(', ')}`;

    return { valid: Object.keys(errors).length === 0, errors };
  }

  isValid(now) {
    return this.validate(now).valid;
  }

  /** Safe representation: masked number, no CVV. */
  toJSON() {
    return {
      id: this.id,
      brand: this.brand,
      type: this.type,
      last4: this.last4,
      maskedNumber: this.maskedNumber,
      cardholderName: this.cardholderName,
      expiryMonth: this.expiryMonth,
      expiryYear: this.expiryYear,
      expiry: this.expiry,
      issuer: this.issuer,
      billingAddress: this.billingAddress,
      status: this.status,
      isDefault: this.isDefault,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

CreditCard.BRANDS = Object.keys(BRANDS);
CreditCard.STATUSES = STATUSES;
CreditCard.TYPES = TYPES;
CreditCard.luhnCheck = luhnCheck;
CreditCard.detectBrand = detectBrand;

module.exports = CreditCard;
