# Emarni GitHub থেকে চালানোর নির্দেশনা

এই প্রজেক্টে frontend-এর পাশাপাশি Firebase Authentication, Realtime Database, Storage ও Cloud Functions আছে। তাই শুধু GitHub Pages চালু করলে পুরো chat app কাজ করবে না। এই প্রজেক্টে GitHub Actions workflow যোগ করা হয়েছে, যা `main` branch-এ push হলে Firebase Hosting এবং backend deploy করবে।

## ১. GitHub-এ project upload করুন

1. [GitHub](https://github.com/) এ sign in করুন।
2. **New repository** চাপুন এবং repository-এর নাম দিন `emarni`।
3. Repository তৈরি করে **Add file → Upload files** চাপুন।
4. ZIP extract করে ভেতরের `Emarni-main` folder-এর সব file ও folder upload করুন। `.github/workflows/deploy-firebase.yml`-সহ hidden file/folder-ও যেন থাকে।
5. Commit message লিখে **Commit changes** করুন। Default branch-এর নাম `main` রাখুন।

## ২. Firebase access নিরাপদে সেট করুন

Workflow-টি বর্তমানে `emarni-chat` Firebase project deploy করে। `.firebaserc` ও `firebase.js`-এর project config-ও সেই project-এর জন্য। অন্য project হলে সব project-specific config আগে মিলিয়ে নিন।

1. Google Cloud Console-এ `emarni-chat` project-এর জন্য deploy করার উপযুক্ত service account তৈরি করুন এবং Firebase Hosting, Realtime Database, Storage ও Cloud Functions deploy করার প্রয়োজনীয় ন্যূনতম IAM permission দিন। Cloud Functions deploy-এর জন্য billing plan ও প্রয়োজনীয় Google APIs সক্রিয় থাকতে হবে।
2. ওই service account-এর JSON key তৈরি করুন। Key-টি নিজের কম্পিউটারে নিরাপদে রাখুন; **কখনো GitHub repository-তে upload/commit করবেন না**।
3. GitHub repository-তে যান: **Settings → Secrets and variables → Actions → New repository secret**।
4. Name হিসেবে `FIREBASE_SERVICE_ACCOUNT` লিখুন; Secret value হিসেবে service-account JSON ফাইলের সম্পূর্ণ content paste করুন। Save করুন।

Service-account key সংবেদনশীল credential। Repository public হলেও secret GitHub Actions Secret হিসেবেই রাখতে হবে; source code-এ বা issue/comment-এ paste করবেন না। সম্ভব হলে দীর্ঘমেয়াদী key-এর বদলে Google Workload Identity Federation ব্যবহার করুন।

## ৩. Deploy করুন

উপরে Secret যোগ করার পরে `main` branch-এ নতুন commit push করলে workflow স্বয়ংক্রিয়ভাবে চলবে। আগের commit থেকে manually চালাতে GitHub-এর **Actions → Deploy Emarni to Firebase → Run workflow** নির্বাচন করুন। Workflow সফল হলে Firebase Hosting URL GitHub Actions log বা Firebase Console-এর Hosting section-এ পাওয়া যাবে।

## ৪. Admin account

Admin role source code-এ শুধু button দেখানোর মাধ্যমে দেওয়া হয় না। Firebase Authentication থেকে নিজের UID নিয়ে `README-BN.md`-এর নির্দেশনা অনুসারে trusted local environment থেকে `functions/set-admin.js` চালিয়ে custom admin claim সেট করুন। Service-account key GitHub-এ commit করবেন না।

## ৫. যদি শুধু GitHub Pages ব্যবহার করতে চান

Repository-এর **Settings → Pages** থেকে deploy source সেট করা যায়, কিন্তু GitHub Pages শুধু static frontend host করে—Firebase Cloud Functions, database rules বা scheduled cleanup চালায় না। তাই private chat, friend request, moderation archive ও ban-এর মতো server-side feature কাজ করার জন্য Firebase backend আলাদা করে deploy করতে হবে। এই repository-র GitHub Actions workflow সেই Firebase deploy করার জন্যই প্রস্তুত করা হয়েছে।
