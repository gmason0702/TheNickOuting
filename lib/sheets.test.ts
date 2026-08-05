import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRandomBytes } = vi.hoisted(() => ({ mockRandomBytes: vi.fn() }));

const valuesGet = vi.fn();
const valuesUpdate = vi.fn();
const valuesBatchUpdate = vi.fn();
const valuesAppend = vi.fn();

vi.mock("crypto", () => ({ randomBytes: mockRandomBytes }));

const actualCrypto = await vi.importActual<typeof import("crypto")>("crypto");
mockRandomBytes.mockImplementation(actualCrypto.randomBytes);

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        JWT: vi.fn(),
      },
      sheets: vi.fn(() => ({
        spreadsheets: {
          values: {
            get: valuesGet,
            update: valuesUpdate,
            batchUpdate: valuesBatchUpdate,
            append: valuesAppend,
          },
        },
      })),
    },
  };
});

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sa@example.iam.gserviceaccount.com";
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_B64 = Buffer.from("fake-key").toString("base64");
process.env.GOOGLE_SHEET_ID = "sheet-id-123";
process.env.GOOGLE_SHEET_TAB_NAME = "Invites List - golf_invite_list";

const {
  appendRow,
  findRowByToken,
  generateUniqueToken,
  getAllRows,
  getTotalGolferCount,
  updateInviteSent,
  updatePaymentRequestSent,
  updatePaymentStatus,
  updateReminder,
  updateRsvpCounts,
} = await import("./sheets");

interface SheetRowFields {
  name: string;
  email: string;
  golf_invite_tier: string;
  "2026_golf_status": string;
  golf_rsvp_count: string;
  reception_invite: string;
  reception_status: string;
  reception_count: string;
  rsvp_token: string;
  payment_status: string;
  payment_amount: string;
  paid_at: string;
  paypal_order_id: string;
  invite_sent_at: string;
  last_reminder_sent_at: string;
  reminder_count: string;
  payment_request_sent_at: string;
}

function sheetRow(overrides: Partial<SheetRowFields> = {}): string[] {
  const base: SheetRowFields = {
    name: "Austen Levihn-Coon",
    email: "austenlc@gmail.com",
    golf_invite_tier: "1",
    "2026_golf_status": "",
    golf_rsvp_count: "",
    reception_invite: "",
    reception_status: "",
    reception_count: "",
    rsvp_token: "_OsmoOGyPJeb9pkWBBhZZA",
    payment_status: "unpaid",
    payment_amount: "",
    paid_at: "",
    paypal_order_id: "",
    invite_sent_at: "",
    last_reminder_sent_at: "",
    reminder_count: "0",
    payment_request_sent_at: "",
  };
  const merged: SheetRowFields = { ...base, ...overrides };
  return [
    merged.name,
    merged.email,
    merged.golf_invite_tier,
    merged["2026_golf_status"],
    merged.golf_rsvp_count,
    merged.reception_invite,
    merged.reception_status,
    merged.reception_count,
    merged.rsvp_token,
    merged.payment_status,
    merged.payment_amount,
    merged.paid_at,
    merged.paypal_order_id,
    merged.invite_sent_at,
    merged.last_reminder_sent_at,
    merged.reminder_count,
    merged.payment_request_sent_at,
  ];
}

beforeEach(() => {
  valuesGet.mockReset();
  valuesUpdate.mockReset();
  valuesBatchUpdate.mockReset();
  valuesAppend.mockReset();
  mockRandomBytes.mockReset();
  mockRandomBytes.mockImplementation(actualCrypto.randomBytes);
});

describe("getAllRows", () => {
  it("parses blank cells as null and preserves row numbers starting at 2", async () => {
    valuesGet.mockResolvedValue({
      data: { values: [sheetRow(), sheetRow({ name: "Bob Jacobi", rsvp_token: "tok2" })] },
    });

    const rows = await getAllRows();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      name: "Austen Levihn-Coon",
      golfInviteTier: 1,
      golfRsvpCount: null,
      receptionCount: null,
      paymentStatus: "unpaid",
      reminderCount: 0,
    });
    expect(rows[1]).toMatchObject({ rowNumber: 3, name: "Bob Jacobi" });
  });

  it("parses populated numeric and date fields", async () => {
    valuesGet.mockResolvedValue({
      data: {
        values: [
          sheetRow({
            golf_rsvp_count: "2",
            reception_count: "4",
            payment_status: "paid",
            payment_amount: "170",
            paid_at: "2026-08-20T12:00:00.000Z",
            paypal_order_id: "ORDER1",
            invite_sent_at: "2026-08-01",
            last_reminder_sent_at: "2026-08-15",
            reminder_count: "1",
            payment_request_sent_at: "2026-08-22",
          }),
        ],
      },
    });

    const [r] = await getAllRows();

    expect(r).toMatchObject({
      golfRsvpCount: 2,
      receptionCount: 4,
      paymentStatus: "paid",
      paymentAmount: 170,
      paidAt: "2026-08-20T12:00:00.000Z",
      paypalOrderId: "ORDER1",
      inviteSentAt: "2026-08-01",
      lastReminderSentAt: "2026-08-15",
      reminderCount: 1,
      paymentRequestSentAt: "2026-08-22",
    });
  });
});

describe("findRowByToken", () => {
  it("returns the exact-match row for a valid token", async () => {
    valuesGet.mockResolvedValue({
      data: { values: [sheetRow({ rsvp_token: "tok-a" }), sheetRow({ rsvp_token: "tok-b" })] },
    });

    const found = await findRowByToken("tok-b");
    expect(found?.rsvpToken).toBe("tok-b");
  });

  it("returns null for an unknown token", async () => {
    valuesGet.mockResolvedValue({ data: { values: [sheetRow({ rsvp_token: "tok-a" })] } });
    expect(await findRowByToken("does-not-exist")).toBeNull();
  });

  it("returns null for a malformed/empty token without matching a blank-token row", async () => {
    valuesGet.mockResolvedValue({ data: { values: [sheetRow({ rsvp_token: "" })] } });
    expect(await findRowByToken("")).toBeNull();
  });
});

describe("getTotalGolferCount", () => {
  it("sums golf_rsvp_count across all rows, treating blanks as zero", async () => {
    valuesGet.mockResolvedValue({
      data: {
        values: [
          sheetRow({ golf_rsvp_count: "1" }),
          sheetRow({ golf_rsvp_count: "" }),
          sheetRow({ golf_rsvp_count: "1", rsvp_token: "tok2" }),
        ],
      },
    });

    expect(await getTotalGolferCount()).toBe(2);
  });

  it("is 0 when there are no rows", async () => {
    valuesGet.mockResolvedValue({ data: { values: [] } });
    expect(await getTotalGolferCount()).toBe(0);
  });
});

describe("updateRsvpCounts", () => {
  it("writes golf_rsvp_count and reception_count as a single targeted batch update", async () => {
    valuesBatchUpdate.mockResolvedValue({});
    await updateRsvpCounts(5, 2, 4);

    expect(valuesBatchUpdate).toHaveBeenCalledTimes(1);
    const call = valuesBatchUpdate.mock.calls[0]![0];
    expect(call.spreadsheetId).toBe("sheet-id-123");
    expect(call.requestBody.data).toEqual([
      { range: "'Invites List - golf_invite_list'!E5", values: [[2]] },
      { range: "'Invites List - golf_invite_list'!H5", values: [[4]] },
    ]);
  });
});

describe("updatePaymentStatus", () => {
  it("writes only the payment columns J:M, never the whole row", async () => {
    valuesUpdate.mockResolvedValue({});
    await updatePaymentStatus(9, {
      paymentStatus: "paid",
      paymentAmount: 170,
      paidAt: "2026-08-20T00:00:00.000Z",
      paypalOrderId: "ORDER99",
    });

    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    const call = valuesUpdate.mock.calls[0]![0];
    expect(call.range).toBe("'Invites List - golf_invite_list'!J9:M9");
    expect(call.requestBody.values).toEqual([
      ["paid", 170, "2026-08-20T00:00:00.000Z", "ORDER99"],
    ]);
  });
});

describe("updateInviteSent", () => {
  it("writes only invite_sent_at", async () => {
    valuesUpdate.mockResolvedValue({});
    await updateInviteSent(3, "2026-08-15");
    const call = valuesUpdate.mock.calls[0]![0];
    expect(call.range).toBe("'Invites List - golf_invite_list'!N3");
    expect(call.requestBody.values).toEqual([["2026-08-15"]]);
  });
});

describe("updatePaymentRequestSent", () => {
  it("writes only payment_request_sent_at", async () => {
    valuesUpdate.mockResolvedValue({});
    await updatePaymentRequestSent(4, "2026-08-22");
    const call = valuesUpdate.mock.calls[0]![0];
    expect(call.range).toBe("'Invites List - golf_invite_list'!Q4");
    expect(call.requestBody.values).toEqual([["2026-08-22"]]);
  });
});

describe("updateReminder", () => {
  it("writes only last_reminder_sent_at and reminder_count", async () => {
    valuesUpdate.mockResolvedValue({});
    await updateReminder(3, { lastReminderSentAt: "2026-08-29", reminderCount: 2 });
    const call = valuesUpdate.mock.calls[0]![0];
    expect(call.range).toBe("'Invites List - golf_invite_list'!O3:P3");
    expect(call.requestBody.values).toEqual([["2026-08-29", 2]]);
  });
});

describe("generateUniqueToken", () => {
  it("returns a fresh token when it doesn't collide with any existing row", async () => {
    valuesGet.mockResolvedValue({ data: { values: [sheetRow({ rsvp_token: "existing-token" })] } });

    const token = await generateUniqueToken();

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(token).not.toBe("existing-token");
  });

  it("retries when the freshly generated token collides with an existing row", async () => {
    const collidingBytes = Buffer.from("already-taken-16b");
    const collidingToken = collidingBytes.toString("base64url");
    valuesGet.mockResolvedValue({ data: { values: [sheetRow({ rsvp_token: collidingToken })] } });
    mockRandomBytes
      .mockImplementationOnce(() => collidingBytes)
      .mockImplementationOnce(() => Buffer.from("a-fresh-unused-16"));

    const token = await generateUniqueToken();

    expect(mockRandomBytes).toHaveBeenCalledTimes(2);
    expect(token).not.toBe(collidingToken);
  });

  it("gives up after 5 attempts if every generated token collides", async () => {
    const collidingBytes = Buffer.from("already-taken-16b");
    const collidingToken = collidingBytes.toString("base64url");
    valuesGet.mockResolvedValue({ data: { values: [sheetRow({ rsvp_token: collidingToken })] } });
    mockRandomBytes.mockImplementation(() => collidingBytes);

    await expect(generateUniqueToken()).rejects.toThrow(
      "Failed to generate a unique RSVP token after 5 attempts",
    );
    expect(mockRandomBytes).toHaveBeenCalledTimes(5);
  });
});

describe("appendRow", () => {
  it("appends all 17 columns in order, leaving tier/counts/manual columns blank", async () => {
    valuesAppend.mockResolvedValue({
      data: { updates: { updatedRange: "'Invites List - golf_invite_list'!A52:Q52" } },
    });

    const rowNumber = await appendRow({
      name: "Jane Golfer",
      email: "jane@example.com",
      rsvpToken: "fresh-token",
    });

    expect(rowNumber).toBe(52);
    expect(valuesAppend).toHaveBeenCalledTimes(1);
    const call = valuesAppend.mock.calls[0]![0];
    expect(call.spreadsheetId).toBe("sheet-id-123");
    expect(call.range).toBe("'Invites List - golf_invite_list'!A2:Q");
    expect(call.insertDataOption).toBe("INSERT_ROWS");
    expect(call.requestBody.values).toEqual([
      [
        "Jane Golfer",
        "jane@example.com",
        "",
        "",
        "",
        "",
        "",
        "",
        "fresh-token",
        "unpaid",
        "",
        "",
        "",
        "",
        "",
        0,
        "",
      ],
    ]);
  });

  it("throws if the append response is missing updatedRange", async () => {
    valuesAppend.mockResolvedValue({ data: {} });

    await expect(
      appendRow({ name: "Jane", email: "jane@example.com", rsvpToken: "tok" }),
    ).rejects.toThrow("Sheet append response missing updatedRange");
  });
});
