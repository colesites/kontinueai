"use server";

import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";

export type WaitlistResult =
	| { success: true; existingUser?: boolean }
	| { error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add an email to the Clerk waitlist.
 *
 * Runs entirely on the server so the secret key never reaches the client. The
 * client form handles validation too, but this is the authoritative check.
 */
export async function joinWaitlist(email: string): Promise<WaitlistResult> {
	const normalized = email.trim().toLowerCase();

	if (!EMAIL_RE.test(normalized)) {
		return { error: "Enter a valid email address." };
	}

	if (!process.env.CLERK_SECRET_KEY) {
		console.error("[desktop-waitlist] CLERK_SECRET_KEY is not configured");
		return {
			error:
				"The desktop waitlist isn't configured yet. Please try again later.",
		};
	}

	try {
		const client = await clerkClient();

		// Existing Kontinue AI users don't need to join the waitlist — desktop
		// access will be enabled for their account when it ships.
		const existingUsers = await client.users.getUserList({
			emailAddress: [normalized],
			limit: 1,
		});
		const isExistingUser = existingUsers.data.some((user) =>
			user.emailAddresses.some(
				(address) => address.emailAddress.toLowerCase() === normalized,
			),
		);
		if (isExistingUser) {
			return { success: true, existingUser: true };
		}

		// Clerk's waitlist endpoint does not always reject duplicate emails, so
		// check first and return a consistent message to the form.
		const existing = await client.waitlistEntries.list({
			query: normalized,
			limit: 1,
		});
		if (
			existing.data.some(
				(entry) => entry.emailAddress.toLowerCase() === normalized,
			)
		) {
			return { error: "You're already on the waitlist." };
		}

		await client.waitlistEntries.create({ emailAddress: normalized });
		return { success: true };
	} catch (error) {
		if (isClerkAPIResponseError(error)) {
			const first = error.errors?.[0];
			const code = first?.code ?? "";
			const message = first?.longMessage ?? first?.message ?? "";

			if (
				code === "form_identifier_exists" ||
				/duplicate|already|exists?/i.test(message)
			) {
				return { error: "You're already on the waitlist." };
			}

			if (
				code === "form_identifier_invalid" ||
				/invalid|email address/i.test(message)
			) {
				return { error: "Enter a valid email address." };
			}

			console.error("[desktop-waitlist] Clerk error", code, message);
		} else {
			console.error("[desktop-waitlist] unexpected error", error);
		}

		return {
			error: "We couldn't add you right now. Please try again.",
		};
	}
}
