import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.RESEND_API_KEY = "re_fake_key";

const sendMock = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: sendMock },
    })),
  };
});

const { sendEmail } = await import("./email");

beforeEach(() => {
  sendMock.mockReset();
});

describe("sendEmail", () => {
  it("sends via Resend from the configured from-address", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });

    await sendEmail("invitee@example.com", { subject: "Hello", html: "<p>Hi</p>" });

    expect(sendMock).toHaveBeenCalledWith({
      from: '"The Nick Jacobi Memorial Golf Tournament" <rsvp@mail.thenickouting.com>',
      to: "invitee@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
    });
  });

  it("throws when Resend reports an error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(
      sendEmail("invitee@example.com", { subject: "Hello", html: "<p>Hi</p>" }),
    ).rejects.toThrow("boom");
  });
});
