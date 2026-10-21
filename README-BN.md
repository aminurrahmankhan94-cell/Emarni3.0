# Emarni — Setup Guide (বাংলা)

Emarni একটি Firebase-ভিত্তিক chat web app। Frontend (`index.html`, `style.css`, `app.js`, `firebase.js`) এবং Firebase Functions backend (`index.js`) একই root folder-এ আছে।

## GitHub-এ আপলোড

1. ZIP Extract করুন।
2. GitHub repository → **Add file → Upload files**।
3. root-এর সব ফাইল আপলোড করুন এবং `.github/workflows/deploy-firebase.yml` path অক্ষত রাখুন।
4. `main` branch-এ commit করুন।
5. Repository settings-এ `FIREBASE_SERVICE_ACCOUNT` নামে Actions secret যোগ করুন। Secret-এ deploy করার অনুমতিসম্পন্ন Firebase service account JSON দিন। Secret JSON কখনো repository-তে আপলোড করবেন না।
6. **Actions** tab থেকে deploy status দেখুন।

## Firebase project

এই project-এর Firebase ID `emarni-chat`। `firebase.json`-এ Hosting source root (`.`) এবং Functions source root (`.`) সেট করা আছে। Functions upload-এ frontend, docs, rules এবং deployment workflow ignore করা হয়েছে।

Firebase Functions deploy করতে প্রয়োজনীয় billing plan ও API সক্রিয় থাকতে পারে। Hosting deploy হলেই backend deploy হয়েছে ধরে নেবেন না।

## Admin setup

Firebase Console → Authentication-এ নিজের account তৈরি করে UID নিন। বিশ্বস্ত local environment-এ Firebase Admin Application Default Credentials সেট করে চালান:

```bash
npm install
npm run set-admin -- FIREBASE_AUTH_UID
```

এরপর sign out/sign in করুন। Admin role custom claim দিয়ে নির্ধারিত; frontend-এ hardcoded admin password নেই।

## Security

Password plaintext সংরক্ষণ করা হয় না। Admin-এর জন্য user password দেখার সুবিধা নেই। Report ও deleted message review শুধুমাত্র অনুমোদিত moderator access ও প্রযোজ্য rules-এর মাধ্যমে হওয়া উচিত। Firebase Database/Storage rules deploy করার আগে আপনার use case অনুযায়ী যাচাই করুন।
