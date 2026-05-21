Get familiar with the project structure.

Each file must have a single responsibility.
Avoid files longer than 150 lines.
If a file grows beyond 100–150 lines, split it into smaller modules.
Avoid components that handle UI, business logic, and API calls together.

Use clear and consistent naming.
Components: UserCard.tsx, SignInForm.tsx
Hooks: Must start with use. useAuth.ts, useFetchPosts.ts
Types: user.types.ts, post.types.ts
Services: auth.service.ts, post.service.ts

Strict TypeScript Rules.
❌ Never use any
❌ Avoid as unknown as
✅ Always define interfaces or types

Separate Logic From UI.
Never put business logic inside UI components.
❌ Bad
const users = await fetch("/api/users")
✅ Good
services/user.service.ts
hooks/useUsers.ts
components/UserList.tsx

Use Absolute Imports
Avoid long relative imports.
❌
import Button from "../../../../components/Button"

✅
import Button from "@/components/Button"

Avoid Massive Components
Components should only handle UI.
Good pattern:
components/
  UserCard.tsx
hooks/
  useUser.ts
services/
  user.service.ts

API Calls Only in Services
Never call APIs directly in components.
❌
fetch("/api/users")
✅
services/user.service.ts

Use Zod or Schema Validation
Always validate data coming from APIs.

Environment Variables
Never hardcode secrets.
❌
const API_KEY = "123456"
✅
process.env.NEXT_PUBLIC_API_URL

No Magic Numbers or Strings
Use constants.
❌
if (role === "admin")
✅
export const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
}

Reusable UI Components. always check if there is a component already existing before creating a new one, or creating a new button in another file.
Common UI must go in a shared folder.
components/ui/
  button.tsx
  modal.tsx
  input.tsx

No Inline Styles
Use Tailwind or CSS modules.

❌
<div style={{margin: 20}}>

Error Handling
Every async function must handle errors.
try {
  const data = await getUsers()
} catch (error) {
  console.error(error)
}

Avoid Duplicate Logic
If logic is reused twice, extract it into:
utils
hooks
services

Use Loading and Error States
Every async UI should handle:
loading
error
success
Example:
if (isLoading) return <Spinner />
if (error) return <ErrorMessage />

Keep Components Pure
Avoid side effects inside render.
Use:
useEffect
custom hooks

No Console Logs in Production
Remove debugging logs.
❌
console.log(data)

Prefer Server Components by Default
Use React Server Components unless client-side interactivity is required.
Components must be server components by default.
Add "use client" only when needed.
Use "use client" only when:
useState
useEffect
browser APIs
event handlers

always do testing