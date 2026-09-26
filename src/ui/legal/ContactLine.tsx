/** How to reach us: the configured address, or a pointer to the app. */
export function ContactLine({ email }: { email: string | null }) {
  return email
    ? <>email <a href={`mailto:${email}`}>{email}</a></>
    : <>use the contact address in the app’s About/Account screen</>;
}
