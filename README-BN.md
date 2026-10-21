# Emarni — আপডেট করা সোর্স কোড

Emarni হলো Firebase-ভিত্তিক chat web app। UI-তে emoji ব্যবহার করা হয়নি। Loading screen-এ Emarni নাম থাকবে এবং স্ক্রিনের একেবারে নিচে ছোট করে **Developed & Designed by Raflido Studios** দেখাবে। একই credit login, sidebar ও page footer-এও আছে।

## অন্তর্ভুক্ত ফিচার

- ইমেইল অথবা Emarni ID এবং password দিয়ে sign in
- নতুন account তৈরি এবং প্রত্যেক account-এর জন্য আলাদা Emarni ID
- Profile name, bio এবং profile photo
- Friend request পাঠানো, accept/decline করা; accepted friend হলেই private chat খোলে
- Global Lounge এবং Mood Support shared chat
- Community group ও অতিরিক্ত business/organisation details-সহ business group
- নিজের message delete; delete হলে অন্য users-এর chat থেকে সরিয়ে দেওয়া হয়
- Report করা message admin review করতে পারেন
- Delete করা message সীমাবদ্ধ moderation archive-এ সর্বোচ্চ ৩০ দিন থাকে; মেয়াদ শেষে scheduled backend স্বয়ংক্রিয়ভাবে মুছে দেয়
- Admin panel: user search, ban/unban, reported messages, deleted-message archive
- Server-side Firebase security rules এবং callable function-এর মাধ্যমে admin-only কাজ

## গুরুত্বপূর্ণ privacy ও password সীমা

Admin panel-এ account password দেখানো হয় না। Firebase Authentication password-কে app-এর database-এ plaintext হিসেবে রাখা হয় না; admin চাইলে password দেখতে পারবেন না। Account recovery/password reset আলাদা করে Firebase Authentication-এর মাধ্যমে সেটআপ করা উচিত।

Admin console দিয়ে সব private conversation নির্বিচারে দেখার সুবিধা রাখা হয়নি। Admin শুধু user-report করা message এবং deleted-message moderation archive দেখতে পারবেন। Admin panel-এ moderation purpose ও ৩০ দিনের retention সম্পর্কে notice দেখানো আছে। অন্য account-এর পরিচয়ে message পাঠিয়ে user সেজে থাকা সুবিধাও যোগ করা হয়নি; প্রয়োজন হলে একটি স্পষ্টভাবে “Emarni Admin” হিসেবে চিহ্নিত contact/notice feature তৈরি করতে হবে।

## চালু করার আগে

1. Node.js 22 এবং Firebase CLI ইনস্টল করুন।
2. Firebase Console-এ `emarni-chat` project খুলে **Authentication > Sign-in method** থেকে Email/Password চালু করুন।
3. Realtime Database ও Storage চালু আছে কিনা যাচাই করুন। Firebase config `firebase.js`-এ project-specific। অন্য Firebase project ব্যবহার করলে ওই ফাইলের config, `.firebaserc`, এবং `functions/index.js`-এর public Web API key fallback একসঙ্গে update করতে হবে।
4. Cloud Functions deploy করতে Firebase project-এ billing/Blaze plan ও Cloud Functions-এর প্রয়োজনীয় API চালু থাকতে হবে।
5. Project root থেকে:

```bash
npm install --prefix functions
npm run lint --prefix functions
firebase login
firebase use emarni-chat
firebase deploy --only hosting,database,storage,functions
```

`functions/index.js`-এ `EMARNI_FIREBASE_WEB_API_KEY` environment variable থাকলে সেটিই ব্যবহার হবে; না থাকলে বিদ্যমান `firebase.js`-এর Web API key fallback হিসেবে আছে। API key password বা service-account secret নয়, তবে অন্য project-এ deploy করার সময় config মিলিয়ে নিন। Service-account private key কখনো ZIP বা public repository-তে যোগ করবেন না।

## নিজের account-কে Admin বানানো

প্রথমে Firebase Authentication থেকে নিজের user UID কপি করুন। তারপর Google Cloud/Firebase Admin SDK credentials দিয়ে নিজের কম্পিউটারে application-default credentials configure করুন। এরপর:

```bash
cd functions
npm install
gcloud auth application-default login
npm run set-admin -- YOUR_FIREBASE_AUTH_UID
```

`YOUR_FIREBASE_AUTH_UID`-এর জায়গায় নিজের UID বসান। পরে Emarni থেকে sign out করে আবার sign in করুন; এরপর sidebar-এ **Admin console** দেখা যাবে. Admin role custom claim দিয়ে নিয়ন্ত্রিত, তাই HTML-এ button দেখালেই কেউ admin হতে পারবে না। Callable functions ও database rules-ও আলাদাভাবে admin claim যাচাই করে।

## Hosting

Static frontend-এ `index.html`, `style.css`, `app.js`, `firebase.js` এবং `firebase.json` আছে। Firebase Hosting ব্যবহার করলে Firebase CLI দিয়ে Hosting initialize/deploy করুন, অথবা অন্য static host-এ এই ফাইলগুলো upload করুন। Backend functions অবশ্যই একই Firebase project-এ deploy করতে হবে।

## Test checklist

- নতুন account তৈরি করে Emarni ID note করুন।
- Log out করে সেই ID/password দিয়ে sign in করুন।
- দ্বিতীয় account দিয়ে friend request পাঠান; accept করার আগে private chat খোলার চেষ্টা করলে block হওয়া উচিত, accept-এর পরে chat চালু হবে।
- নিজের message delete করে user chat থেকে সরে গেছে এবং admin deleted-message archive-এ এসেছে কিনা যাচাই করুন।
- রিপোর্ট পাঠিয়ে Admin console-এ review করুন।
- সাধারণ account-এ Admin console দেখা যাবে না; admin custom claim থাকা account-এ দেখা যাবে।
- User ban করার পর তার protected chat ও write access বন্ধ হচ্ছে কিনা যাচাই করুন।

এটি source-code handoff; live Firebase project-এ deploy ও দুইটি test account দিয়ে end-to-end testing না করা পর্যন্ত production-ready বলে ধরে নেবেন না।
