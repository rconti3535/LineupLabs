import { db } from "./server/db";
import { users } from "./shared/schema";

async function clearUsers() {
  const allUsers = await db.select({ id: users.id, username: users.username, email: users.email }).from(users);
  console.log(`Found ${allUsers.length} users:`);
  allUsers.forEach(u => console.log(`  id=${u.id} username="${u.username}" email="${u.email}"`));
  
  if (allUsers.length === 0) {
    console.log("No users to clear.");
    process.exit(0);
  }

  await db.update(users).set({ username: "", password: "", email: "" });
  console.log(`Cleared username, password, and email for ${allUsers.length} users.`);
  process.exit(0);
}

clearUsers().catch(e => { console.error(e); process.exit(1); });
