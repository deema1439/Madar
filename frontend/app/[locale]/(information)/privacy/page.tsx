import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalDocument } from "@/features/marketing/legal/legal-document";

const content = {
  ar: {
    label: "الخصوصية والبيانات",
    title: "سياسة الخصوصية",
    intro:
      "خصوصيتك تهمنا. هنا نوضح لك أنواع البيانات اللي قد نحتاجها لتقديم خدمات مدار وكيف تُستخدم، وحقوقك المتعلقة فيها.",
    updated: "آخر تحديث: 26 أكتوبر 2026",
    sections: [
      {
        title: "1. من نحن",
        paragraphs: [
          "مدار منصة تساعدك تبحث عن البيوت وتقارن بينها وتتعرف على الأحياء والخدمات القريبة وتحلل مشاويرك اليومية.",
          "تُدار المنصة بواسطة [الاسم القانوني للمشغّل]. ويمكن التواصل مع الجهة المسؤولة عن البيانات من خلال [بريد التواصل الرسمي].",
        ],
      },
      {
        title: "2. البيانات اللي نتعامل معها",
        paragraphs: [
          "بحسب الخدمات اللي تستخدمها، قد نتعامل مع بيانات الحساب مثل الاسم والبريد الإلكتروني، وتفضيلات السكن والميزانية، والبيوت اللي تحفظها، والأماكن اللي تضيفها لتحليل المشاوير.",
          "قد تشمل البيانات أيضًا المواقع اللي تدخلها بنفسك، ومحتوى محادثات مساعد مدار، وسجلات العمليات والمدفوعات، والبيانات التقنية اللازمة لتشغيل الخدمة وحمايتها.",
          "مو كل الخدمات تحتاج نفس البيانات. نطلب البيانات المرتبطة بالخدمة اللي تستخدمها.",
        ],
      },
      {
        title: "3. ليش نستخدم بياناتك",
        paragraphs: [
          "نستخدم البيانات لتشغيل حسابك، وعرض البيوت المناسبة لتفضيلاتك، وحساب المشاوير، وتقديم المقارنات والتوصيات والخدمات اللي تطلبها.",
          "وقد نستخدم البيانات اللازمة لحماية الحسابات، ومعالجة المشكلات التقنية، وتنفيذ الالتزامات النظامية، وتحسين الخدمة ضمن الأغراض والمسوغات النظامية المطبقة.",
        ],
      },
      {
        title: "4. المواقع والأماكن المهمة لك",
        paragraphs: [
          "إذا أضفت موقع بيتك أو دوامك أو أي مكان مهم لك، فقد يُستخدم لحساب المسافات وأوقات الوصول والخدمات القريبة.",
          "بعض عمليات الخرائط والمسارات تحتاج إرسال معلومات موقع إلى مزودي الخدمة المرتبطين بهذه الوظائف. يجب توضيح الجهات المستلمة وطبيعة البيانات المنقولة في النسخة النهائية من السياسة.",
        ],
      },
      {
        title: "5. مساعد مدار الذكي",
        paragraphs: [
          "إذا استخدمت مساعد مدار، فقد تُعالج رسائلك والمعلومات المرتبطة بطلبك لتوليد الردود المناسبة.",
          "قد تتطلب هذه الخدمة الاستعانة بمزود خارجي لنماذج الذكاء الاصطناعي. تجنب إدخال كلمات المرور أو البيانات البنكية أو المعلومات الحساسة غير الضرورية في المحادثة.",
        ],
      },
      {
        title: "6. مشاركة البيانات",
        paragraphs: [
          "قد نحتاج مشاركة بيانات محددة مع مزودي الخدمات التقنية اللازمة لتشغيل مدار، مثل الاستضافة والخرائط والذكاء الاصطناعي ومعالجة المدفوعات.",
          "تختلف البيانات المشاركة حسب الخدمة المستخدمة. يجب الإفصاح عن فئات المستلمين وأي نقل أو معالجة خارج المملكة بحسب الواقع والمتطلبات النظامية.",
        ],
      },
      {
        title: "7. حفظ البيانات وحمايتها",
        paragraphs: [
          "نلتزم باتخاذ التدابير الأمنية المناسبة لحماية البيانات من الوصول أو الاستخدام غير المصرح به.",
          "تُحدد مدد الاحتفاظ بالبيانات بحسب الغرض من معالجتها والالتزامات النظامية. ويجب نشر المدد الفعلية أو معايير تحديدها بعد مراجعة إعدادات النظام وسياسة الاحتفاظ.",
        ],
      },
      {
        title: "8. ملفات تعريف الارتباط",
        paragraphs: [
          "قد يستخدم مدار ملفات تعريف الارتباط الضرورية لتسجيل الدخول وحماية الجلسات وحفظ بعض تفضيلات الاستخدام.",
          "يجب توضيح أي ملفات إضافية للتحليلات أو التسويق وآلية التحكم فيها إذا كانت مستخدمة فعليًا.",
        ],
      },
      {
        title: "9. حقوقك",
        paragraphs: [
          "وفق نظام حماية البيانات الشخصية السعودي، قد يكون لك الحق في معرفة كيفية معالجة بياناتك والوصول إليها وطلب نسخة منها وتصحيحها وطلب إتلافها في الحالات التي يجيزها النظام.",
          "يمكنك أيضًا سحب موافقتك عندما تكون الموافقة هي المسوغ النظامي للمعالجة، وفق الضوابط والاستثناءات المطبقة.",
          "لممارسة حقوقك، تواصل معنا عبر [بريد التواصل الرسمي].",
        ],
      },
      {
        title: "10. تحديث السياسة",
        paragraphs: [
          "قد نحدث هذه السياسة إذا تغيرت خدمات مدار أو طريقة معالجة البيانات أو المتطلبات النظامية. سنوضح تاريخ التحديث ونوفر الإشعارات اللازمة عند الاقتضاء.",
        ],
      },
      {
        title: "11. التواصل معنا",
        paragraphs: [
          "لأي استفسار أو طلب متعلق بخصوصيتك، تواصل مع فريق مدار عبر [madarplatform@aol.com]",
        ],
      },
    ],
    back: "العودة للرئيسية",
    terms: "الشروط والأحكام",
  },
  en: {
    label: "Privacy & Data",
    title: "Privacy Policy",
    intro:
      "Your privacy matters. This policy explains the types of information MADAR may process, why it is needed, and the rights available to you.",
    updated: "Last updated: October 26, 2026",
    sections: [
      {
        title: "1. Who We Are",
        paragraphs: [
          "MADAR is a home discovery platform offering home comparisons, neighborhood insights, commute analysis, and personalized recommendations.",
          "The platform is operated by [Legal Operator Name]. For privacy inquiries, contact [Official Contact Email].",
        ],
      },
      {
        title: "2. Information We Process",
        paragraphs: [
          "Depending on the features you use, information may include account details, housing preferences, budgets, saved homes, submitted locations, AI conversations, transaction records, and necessary technical information.",
          "Different features require different information. Data collection should be limited to what is necessary for the relevant service.",
        ],
      },
      {
        title: "3. How Information Is Used",
        paragraphs: [
          "Information is processed to manage accounts, provide home discovery, calculate commute times, deliver comparisons and recommendations, maintain security, and fulfill applicable legal obligations.",
        ],
      },
      {
        title: "4. Location Information",
        paragraphs: [
          "Locations you provide may be used to calculate routes, travel times, and nearby amenities.",
          "Some mapping features may involve sharing location information with external service providers. The final policy must identify relevant recipients and disclosures.",
        ],
      },
      {
        title: "5. AI Assistant",
        paragraphs: [
          "Messages and relevant context submitted to MADAR's AI assistant may be processed to generate responses.",
          "External AI service providers may be involved. Avoid submitting passwords, payment credentials, or unnecessary sensitive information.",
        ],
      },
      {
        title: "6. Service Providers",
        paragraphs: [
          "Certain information may be processed by providers supporting hosting, mapping, AI functionality, and payments.",
          "The final policy must reflect actual recipients, processing arrangements, and any international transfers.",
        ],
      },
      {
        title: "7. Retention and Security",
        paragraphs: [
          "Appropriate technical and organizational safeguards are required to protect personal information.",
          "Retention periods depend on processing purposes and applicable obligations. Actual retention periods or determining criteria must be confirmed before publication.",
        ],
      },
      {
        title: "8. Cookies",
        paragraphs: [
          "MADAR may use essential cookies for authentication, session security, and preferences.",
          "Any additional analytics or marketing cookies and related controls must be disclosed if implemented.",
        ],
      },
      {
        title: "9. Your Rights",
        paragraphs: [
          "Subject to applicable Saudi personal data protection requirements, you may have rights to information, access, a readable copy, correction, and destruction of your personal data.",
          "You may also withdraw consent where consent is the applicable legal basis, subject to legal requirements.",
          "Contact [Official Contact Email] to submit a request.",
        ],
      },
      {
        title: "10. Policy Changes",
        paragraphs: [
          "This policy may be updated to reflect changes in services, data practices, or legal requirements. The revision date will be updated and required notices provided.",
        ],
      },
      {
        title: "11. Contact",
        paragraphs: [
          "For privacy inquiries, contact [Legal Operator Name] at [Official Contact Email].",
        ],
      },
    ],
    back: "Back to home",
    terms: "Terms of Use",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const copy = locale === "ar" ? content.ar : content.en;
  return {
    title: copy.title,
    description: copy.intro,
    alternates: { languages: { ar: "/ar/privacy", en: "/en/privacy" } },
    openGraph: {
      title: copy.title,
      description: copy.intro,
      locale: locale === "ar" ? "ar_SA" : "en_US",
    },
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const copy = locale === "ar" ? content.ar : content.en;
  return (
    <LegalDocument
      copy={copy}
      relatedHref="/terms"
      relatedLabel={copy.terms}
      backLabel={copy.back}
      contentsLabel={locale === "ar" ? "في هذه الصفحة" : "On this page"}
    />
  );
}
