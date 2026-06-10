export default function PrivacyPolicy() {
	return (
		<div className="container mx-auto px-4 py-16 max-w-4xl">
			<h1 className="text-4xl font-bold mb-8">Kontinue AI Privacy Policy</h1>
			<div className="space-y-6 text-muted-foreground">
				<p className="text-sm">
					<strong>Last Updated:</strong> June 10, 2026
					<br />
					<strong>Effective Date:</strong> June 10, 2026
				</p>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						1. Introduction
					</h2>
					<p>
						This privacy policy ("Policy") describes how Kontinue AI ("Company",
						"we", "us") collects, uses, and shares personal information of users
						of this website, https://kontinueai.com (the "Site"), as well as
						associated products and services (together, the "Services"). This
						Policy applies to personal information that we collect through the
						Site and our Services as well as personal information you provide to
						us directly.
					</p>
					<p className="mt-4">
						By using the Site or the Services, you accept the practices and
						policies described in this Policy and you consent that we will
						collect, use, and share your personal information as described
						below. If you do not agree to this Policy, please do not use the
						Site or the Services.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						2. Personal Information We Collect
					</h2>
					<p className="mb-4">
						We collect personal information about you in several ways:
					</p>

					<h3 className="text-xl font-semibold text-foreground mb-2">
						Information You Provide:
					</h3>
					<ul className="list-disc pl-6 space-y-2">
						<li>
							<strong>Account Information:</strong> When you create an account,
							we collect your name, email address, and password.
						</li>
						<li>
							<strong>Chat Data:</strong> When you import conversations from
							other AI platforms (ChatGPT, Claude, Gemini, Perplexity, Mistral,
							T3 Chat, etc.), we store this data to provide our Services.
						</li>
						<li>
							<strong>Usage Information:</strong> Information about which AI
							models you use, your preferences, and how you interact with our
							Services.
						</li>
						<li>
							<strong>Payment Information:</strong> If you subscribe to our Pro
							plan, we collect billing details through our payment processor.
						</li>
						<li>
							<strong>Connected Account Data:</strong> If you choose to connect a
							third-party account (such as Google/Gmail, Google Calendar, Google
							Drive, GitHub, Notion, Vercel, or Todoist), we access data from that
							account only as needed to perform the actions you request in
							Kontinue AI. Google data is handled as described in the "Google User
							Data and Limited Use" section below.
						</li>
					</ul>

					<h3 className="text-xl font-semibold text-foreground mb-2 mt-4">
						Information We Collect Automatically:
					</h3>
					<ul className="list-disc pl-6 space-y-2">
						<li>
							<strong>Device Information:</strong> IP address, browser type,
							operating system, device identifiers.
						</li>
						<li>
							<strong>Usage Data:</strong> Pages visited, features used, time
							spent, access times.
						</li>
						<li>
							<strong>Cookies:</strong> We use cookies and similar technologies
							to enhance your experience and analyze usage patterns.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						3. How We Use Your Personal Information
					</h2>
					<ul className="list-disc pl-6 space-y-2">
						<li>
							<strong>To Provide Services:</strong> Process your requests,
							manage your account, enable chat imports, facilitate model
							switching, and organize your conversations.
						</li>
						<li>
							<strong>To Improve Services:</strong> Analyze usage patterns,
							develop new features, and enhance user experience.
						</li>
						<li>
							<strong>To Communicate:</strong> Send service updates, respond to
							inquiries, and provide customer support.
						</li>
						<li>
							<strong>For Security:</strong> Detect and prevent fraud, abuse,
							and security incidents.
						</li>
						<li>
							<strong>AI Model Training:</strong> We do NOT use your personal
							conversations or imported chat data to train AI models.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						4. How We Share Your Personal Information
					</h2>
					<p className="mb-4">We may share your information with:</p>
					<ul className="list-disc pl-6 space-y-2">
						<li>
							<strong>AI Service Providers:</strong> When you use our Services,
							we send your prompts to third-party AI providers (OpenAI,
							Anthropic, Google, etc.) to generate responses. Each provider has
							their own privacy policy.
						</li>
						<li>
							<strong>Service Providers:</strong> Cloud hosting (Vercel, AWS),
							payment processing, analytics, and other operational services.
						</li>
						<li>
							<strong>Legal Requirements:</strong> When required by law, to
							protect rights and safety, or in connection with legal
							proceedings.
						</li>
						<li>
							<strong>Business Transfers:</strong> In connection with a merger,
							acquisition, or sale of assets.
						</li>
					</ul>
					<p className="mt-4">
						<strong>We do not sell your personal information.</strong>
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						5. Google User Data and Limited Use
					</h2>
					<p className="mb-4">
						When you connect a Google account (Gmail, Google Calendar, and/or
						Google Drive), Kontinue AI requests only the OAuth scopes needed for
						the features you use, and accesses your Google data solely to provide
						those features at your request:
					</p>
					<ul className="list-disc pl-6 space-y-2">
						<li>
							<strong>Gmail</strong> (<code>gmail.readonly</code>,{" "}
							<code>gmail.send</code>): to search and read your messages when you
							ask the assistant about your email, and to send emails that you
							compose and explicitly choose to send from Kontinue AI.
						</li>
						<li>
							<strong>Google Calendar</strong> (<code>calendar.readonly</code>,{" "}
							<code>calendar.events</code>): to show your events when you ask, and
							to create or update events at your request.
						</li>
						<li>
							<strong>Google Drive</strong> (<code>drive.readonly</code>): to
							search for and read your files when you ask the assistant about
							them.
						</li>
					</ul>
					<p className="mt-4">
						Google data is accessed only in direct response to an explicit action
						you take, is used only to provide and improve these user-facing
						features, and is never sold, used for advertising, or used to train
						generalized AI/ML models. We retain Google data only as long as needed
						to provide the feature, and you can revoke access at any time by
						disconnecting the connector in Settings → Connectors or via your{" "}
						<a
							href="https://myaccount.google.com/permissions"
							className="text-violet-600 hover:underline"
							target="_blank"
							rel="noreferrer"
						>
							Google Account permissions
						</a>
						.
					</p>
					<p className="mt-4">
						<strong>
							Kontinue AI&apos;s use and transfer of information received from
							Google APIs to any other app will adhere to the{" "}
							<a
								href="https://developers.google.com/terms/api-services-user-data-policy"
								className="text-violet-600 hover:underline"
								target="_blank"
								rel="noreferrer"
							>
								Google API Services User Data Policy
							</a>
							, including the Limited Use requirements.
						</strong>
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						6. Your Choices and Rights
					</h2>
					<ul className="list-disc pl-6 space-y-2">
						<li>
							<strong>Access and Update:</strong> You can access and update your
							account information through your account settings.
						</li>
						<li>
							<strong>Delete Data:</strong> You can request deletion of your
							account and associated data by contacting us.
						</li>
						<li>
							<strong>Export Data:</strong> You can export your conversations
							and data at any time.
						</li>
						<li>
							<strong>Marketing Communications:</strong> You can opt out of
							marketing emails by clicking the unsubscribe link.
						</li>
						<li>
							<strong>Cookies:</strong> You can control cookies through your
							browser settings.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						7. Data Security
					</h2>
					<p>
						We implement reasonable security measures to protect your personal
						information from unauthorized access, use, or disclosure. However,
						no method of transmission over the internet or electronic storage is
						100% secure. We cannot guarantee absolute security.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						8. Data Retention
					</h2>
					<p>
						We retain your personal information for as long as necessary to
						provide our Services and fulfill the purposes described in this
						Policy, unless a longer retention period is required by law.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						9. Children's Privacy
					</h2>
					<p>
						Our Services are not intended for children under 13 years of age. We
						do not knowingly collect personal information from children under
						13. If you believe we have collected information from a child under
						13, please contact us immediately.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						10. International Users
					</h2>
					<p>
						Our Services are provided in the United States. If you use our
						Services from outside the United States, your information will be
						transferred to and processed in the United States.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						11. Changes to This Policy
					</h2>
					<p>
						We may update this Policy from time to time. We will notify you of
						material changes by posting the updated Policy on our Site and
						updating the "Effective Date" above.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-bold text-foreground mb-4">
						12. Contact Us
					</h2>
					<p>
						If you have questions about this Privacy Policy, please contact us
						at:
					</p>
					<p className="mt-4">
						<strong>Kontinue AI</strong>
						<br />
						Email:{" "}
						<a
							href="mailto:privacy@kontinueai.com"
							className="text-violet-600 hover:underline"
						>
							privacy@kontinueai.com
						</a>
					</p>
				</section>
			</div>
		</div>
	);
}
