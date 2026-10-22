# Supabase email templates

`confirm-signup.html` is the body of Supabase's **Confirm signup** email, in Vietnamese and English.

## Using it

1. Supabase dashboard > **Authentication > Emails > Templates > Confirm signup**.
2. Replace the **Message body** with the whole contents of `confirm-signup.html`.
3. Set the **Subject** to: `Xác nhận tài khoản The Monkey Business / Confirm your The Monkey Business account`
4. Save, then sign up with a new address to try it.

## The one rule: nothing else in `{{ }}`

Supabase runs the template through Go's template engine, which treats **any text in double curly braces as an instruction, even inside an HTML comment**. The file therefore contains only the three variables it really uses, and they must stay written exactly like this:

- `{{ .ConfirmationURL }}`: the confirm link. Where it lands is decided by Authentication > URL Configuration (Site URL and Redirect URLs), not by this file.
- `{{ .Data.first_name }}`: the first name typed on the sign-up page.
- `{{ .Email }}`: the address being confirmed.

Do not write notes or examples with double curly braces anywhere in the template. A mistake makes Supabase skip sending the email entirely, while the sign-up still looks successful. It shows up in the Auth logs as `templatemailer: template type "confirmation": ... unexpected ...`.

Only inline styles and tables are used on purpose: many email apps ignore stylesheets and web fonts.
