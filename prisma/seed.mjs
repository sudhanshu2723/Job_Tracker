// Seed a demo account you can log in with immediately.
//   username: demo   password: demo1234
// Run: node prisma/seed.mjs
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const apps = [
  { company: "Stripe", role: "Software Engineer, Backend", location: "Bengaluru, India", source: "Greenhouse", dateApplied: "2026-07-02", referral: true, referrer: "Aarav Mehta", status: "interview", ctc: "₹48 LPA", link: "https://stripe.com/jobs", followUp: "2026-07-24", notes: "Onsite loop scheduled. Prep system design." },
  { company: "Razorpay", role: "SDE II", location: "Remote (India)", source: "LinkedIn", dateApplied: "2026-07-08", referral: false, referrer: "", status: "oa", ctc: "₹36 LPA", link: "", followUp: "2026-07-23", notes: "HackerRank OA due this week." },
  { company: "Atlassian", role: "Backend Engineer", location: "Bengaluru, India", source: "Lever", dateApplied: "2026-06-20", referral: true, referrer: "Priya Nair", status: "offer", ctc: "₹54 LPA", link: "", followUp: "", notes: "Offer received — negotiating." },
  { company: "Zomato", role: "Software Development Engineer", location: "Gurugram, India", source: "Naukri", dateApplied: "2026-06-15", referral: false, referrer: "", status: "rejected", ctc: "", link: "", followUp: "", notes: "Rejected after phone screen." },
  { company: "Google", role: "SWE II, Payments", location: "Hyderabad, India", source: "Company Site", dateApplied: "2026-07-12", referral: true, referrer: "Rohan Gupta", status: "applied", ctc: "", link: "", followUp: "2026-07-21", notes: "Referral submitted via internal portal." },
  { company: "Uber", role: "Backend Engineer II", location: "Bengaluru, India", source: "LinkedIn", dateApplied: "2026-06-28", referral: false, referrer: "", status: "ghosted", ctc: "", link: "", followUp: "", notes: "No response in 3+ weeks." },
  { company: "Notion", role: "Product Engineer", location: "Remote", source: "Wellfound", dateApplied: "", referral: false, referrer: "", status: "wishlist", ctc: "", link: "https://notion.so/careers", followUp: "", notes: "Dream role — tailor resume before applying." },
];

const existing = await prisma.user.findUnique({ where: { username: "demo" } });
if (existing) {
  console.log("Demo user already exists — skipping seed.");
} else {
  const user = await prisma.user.create({
    data: {
      username: "demo",
      passwordHash: await bcrypt.hash("demo1234", 10),
    },
  });
  await prisma.application.createMany({
    data: apps.map((a) => ({ ...a, userId: user.id })),
  });
  console.log(`Seeded demo user (demo / demo1234) with ${apps.length} applications.`);
}
await prisma.$disconnect();
