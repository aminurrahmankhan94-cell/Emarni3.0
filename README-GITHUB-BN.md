# Emarni GitHub-এ আপলোড করার বাংলা নির্দেশিকা

এই সংস্করণে ওয়েবসাইট এবং Firebase Functions-এর entry file সব root-এ আছে। আলাদা `functions` folder তৈরি করতে হবে না। শুধু GitHub Actions-এর স্বয়ংক্রিয় deployment-এর জন্য ZIP-এর `.github/workflows/deploy-firebase.yml` path-টি ঠিক রাখতে হবে।

## GitHub website দিয়ে আপলোড

1. ZIP Extract করুন।
2. আপনার `Emarni3.0` repository খুলুন।
3. **Add file → Upload files** চাপুন।
4. Extract করা ফাইলগুলো আপলোড করুন। `index.html`, `style.css`, `app.js`, `firebase.js`, `index.js`, `package.json`, `firebase.json`, `database.rules.json`, `storage.rules`, `set-admin.js` এবং README ফাইল root-এ থাকবে।
5. `.github/workflows/deploy-firebase.yml`-এর folder path অক্ষুণ্ণ রাখুন। Hidden `.github` folder না দেখালে file picker-এ hidden files দেখান, অথবা GitHub-এ **Add file → Create new file** দিয়ে filename হিসেবে `.github/workflows/deploy-firebase.yml` লিখুন।
6. **Commit changes** করুন।
7. Repository **Settings → Secrets and variables → Actions**-এ `FIREBASE_SERVICE_ACCOUNT` secret তৈরি করুন। Value হিসেবে Firebase deployment service account JSON দিন। JSON ফাইল public repository-তে দেবেন না।
8. **Actions** tab-এ workflow run সফল হয়েছে কি না দেখুন।

## Configuration

- Firebase project: `emarni-chat`
- Node.js: `22`
- Hosting root: `.`
- Functions source root: `.`; frontend/static files Functions upload থেকে বাদ দেওয়া আছে।

Firebase Functions-এর জন্য billing/API setup প্রয়োজন হতে পারে। Deploy করার পর দুইটি account দিয়ে signup/login, friend request, private/group chat, image upload, message deletion এবং admin moderation পরীক্ষা করুন। এই ZIP live Firebase deployment পরীক্ষা করে তৈরি করা হয়নি।

## Admin role

Admin role frontend password দিয়ে নয়, Firebase Authentication custom claim দিয়ে নির্ধারিত হয়। Local environment-এ Firebase Admin credentials সেট করে `npm install` এবং `npm run set-admin -- FIREBASE_AUTH_UID` চালাতে হবে। অন্য কারও পরিচয়ে message পাঠানো বা password দেখা সমর্থিত নয়।
