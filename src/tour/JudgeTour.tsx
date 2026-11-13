import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Compass, RotateCcw, X } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { useOpsStore } from '../opsAgent/store';
import { useSusStore } from '../sustainability/store';
import { approve, DEMO_GOALS, plan } from '../opsAgent/runtime';
import { runDevelopment, DEV_DEFAULTS } from '../sustainability/development';
import { openAgent, openCentre } from '../nav/MainNav';
import { useTourStore } from './store';
import { useI18n } from '../i18n/i18nContext';
import { FACILITIES } from '../sustainability/facilities';
import { PARKNEX_STEPS } from '../parknex/tour';

/**
 * The judge demonstration: ten steps that tell one story through the real application. Each step calls the same
 * actions a user would (camera, incident timeline, the agent's plan/approve, the Command Centre, the development
 * model); nothing is pre-recorded, so the numbers shown are the models' own.
 */

interface Step {
  title: string;
  body: string;
  titleAr?: string;
  bodyAr?: string;
  enter: () => void;
  /** an optional action the judge can trigger from the card */
  act?: { label: string; run: () => void; done?: () => boolean };
}

const twin = () => useTwinStore.getState();
const ops = () => useOpsStore.getState();
const sus = () => useSusStore.getState();

export const STEPS: Step[] = [
  {
    title: 'Explore Al Sajaa', titleAr: 'استكشف السجعة', bodyAr: `توأم رقمي إجرائي لمنطقة السجعة الصناعية في الشارقة: ${FACILITIES.length} منشأة صناعية مُنمذجة، ومنازل وفلل البحيرات، وقطار الاتحاد، وتقاطع E611، وخمس شبكات مرافق تحت الأرض. اسحب للدوران ومرّر للتكبير.`,
    body: `A procedural twin of the Al Sajaa industrial district, Sharjah: ${FACILITIES.length} modelled industrial facilities, homes and lagoon villas, Etihad Rail, the E611 interchange and five underground utility networks. Drag to orbit, scroll to zoom.`,
    enter: () => {
      ops().setOpen(false);
      sus().setOpen(false);
      twin().resetView();
    },
  },
  {
    title: 'Discover an issue', titleAr: 'اكتشف مشكلة', bodyAr: 'تُبلغ مستشعرات محاكاة قرب الطريق الرئيسي عن انخفاض في الضغط وتربة رطبة: حادث خط المياه المُعدّ مسبقاً في التوأم. انظر تحت الطريق بوضع الأشعة.',
    body: 'Simulated sensors near the main road report a pressure drop and wet ground: the twin\'s scripted water-main incident. Look under the road in X-ray.',
    enter: () => {
      twin().skipToIncident();
    },
  },
  {
    title: 'Ask the AI Operations Agent', titleAr: 'اسأل وكيل العمليات الذكي', bodyAr: 'يُكتب الهدف بكلمات بسيطة. يقرؤه الوكيل بقواعد ثابتة (لا يوجد نموذج لغوي متصل)، ويحدد سير عمل حادث المياه، ويستدعي أدواته.',
    body: 'The goal is typed in plain words. The agent reads it with deterministic rules (no language model is connected), finds the Water Incident workflow, and calls its tools.',
    enter: () => {
      openAgent('agent');
      ops().setRun(plan(DEMO_GOALS[0].goal));
      const h = ops().run?.result?.highlight.focus;
      if (h) twin().focusPlace(h.x, h.z, h.r);
    },
  },
  {
    title: 'Watch it analyse', titleAr: 'تابع التحليل', bodyAr: 'تعرض حالة المهمة كل خطوة: فحص الأصول والمستشعرات المحاكاة، وتشغيل نموذج التسرب، وتسجيل كل استدعاء أداة. تُظهر الخريطة الخط المتسرب وصمامات العزل ومسار الفريق من المستودع.',
    body: 'Task status shows each step: assets and simulated sensors inspected, the leak model run, every tool call logged. The map shows the leaking main, the isolation valves and the crew route from the depot.',
    enter: () => openAgent('agent'),
  },
  {
    title: 'Compare alternatives', titleAr: 'قارن البدائل', bodyAr: 'ثلاثة تدخلات مقابل الاستجابة التقليدية، مع التغير المطلق والنسبي لكل مؤشر، والأوزان التي بُني عليها الاختيار، وما لا يستطيع النموذج تقديره.',
    body: 'Three interventions against the reactive baseline, with absolute and percentage change for every KPI, the weights behind the choice, and what the model cannot estimate.',
    enter: () => openAgent('compare'),
  },
  {
    title: 'Approve the intervention', titleAr: 'وافق على التدخل', bodyAr: 'لا يحدث شيء دون إنسان. يُمنع المشاهد؛ ويوافق المشغّل. وافق في اللوحة أو استخدم الزر أدناه (المشغّل «الحَكَم»).',
    body: 'Nothing happens without a human. A viewer is blocked; an operator approves. Approve in the panel, or use the button below (operator "Judge").',
    enter: () => openAgent('agent'),
    act: {
      label: 'Approve as operator',
      run: () => {
        const r = ops().run;
        if (r && r.state === 'awaiting-approval') ops().setRun(approve(r, { by: 'Judge', role: 'operator' }));
      },
      done: () => ['executed', 'verified'].includes(ops().run?.state ?? ''),
    },
  },
  {
    title: 'Watch the city change', titleAr: 'شاهد المدينة تتغير', bodyAr: 'يُطبَّق الإجراء المعتمد على التوأم المحاكى: يُرسم العزل على الشبكة ويعيد الوكيل تشغيل النموذج بشكل مستقل للتحقق منه.',
    body: 'The approved action is applied to the simulated twin: the isolation is drawn on the network and the agent re-runs the model independently to verify it.',
    enter: () => {
      openAgent('agent');
      const h = ops().run?.result?.highlight.focus;
      if (h) twin().focusPlace(h.x, h.z, h.r * 0.8);
    },
  },
  {
    title: 'Inspect the measured-in-model impact', titleAr: 'افحص الأثر المُقدَّر في النموذج', bodyAr: 'يعرض التحقق الأهداف التي تحققت وما تغيّر والمخاطر المتبقية، بما في ذلك ما يحتاج إلى بيانات حقيقية. كل الأرقام محاكاة.',
    body: 'Verification lists which targets were met, what changed, and the remaining risks — including what would need real data. All figures are simulated.',
    enter: () => openAgent('audit'),
  },
  {
    title: 'Sustainability Command Centre', titleAr: 'مركز قيادة الاستدامة', bodyAr: 'ميزان الكربون المُنمذج للمدينة: لكل منشأة صناعية فئتها وحجمها وساعات عملها ووقودها ومعدات الحد من التلوث. اضغط على بطاقة لعرضها على الخريطة، وحرّك الأدوات لاختبار السياسات.',
    body: 'City-wide modelled carbon balance: every industrial facility has its own category, size, hours, fuel and abatement. Click a card to see it on the map; move the levers to test policies.',
    enter: () => {
      openCentre('overview');
      sus().setLayer('facilities');
      twin().focusPlace(-60, -160, 120);
    },
  },
  {
    title: 'Plan a new development', titleAr: 'خطّط لتطوير جديد', bodyAr: 'ماذا لو بُني 15 مصنعاً لتشكيل المعادن في المنطقة الصناعية الشمالية البعيدة؟ تُوضع على أراضٍ شاغرة يمكن الوصول إليها بالطرق، وتُقارن مع حزمة التخفيف وبدونها.',
    body: 'What if 15 metal-fabrication plants are built in the Far Northern Industrial Zone? They are sited on vacant, road-accessible land and compared with and without a mitigation package.',
    enter: () => {
      openCentre('development');
      const r = runDevelopment(DEV_DEFAULTS);
      sus().setDevInputs(DEV_DEFAULTS);
      sus().setDev(r);
      sus().setLayer('development');
      if (r.sites.length) twin().focusPlace(r.sites[0].x, r.sites[0].z, 45);
    },
  },
];

export function JudgeTour() {
  const active = useTourStore((s) => s.active);
  const step = useTourStore((s) => s.step);
  const which = useTourStore((s) => s.which);
  const STEPS_ = (which === 'parknex' ? PARKNEX_STEPS : STEPS) as Step[];
  const go = useTourStore((s) => s.go);
  const stop = useTourStore((s) => s.stop);
  const runState = useOpsStore((s) => s.run?.state);
  const entered = useRef(-1);
  const { locale } = useI18n();
  const ar = locale === 'ar';
  useEffect(() => {
    if (!active) {
      entered.current = -1;
      return;
    }
    if (entered.current === step) return;
    entered.current = step;
    STEPS_[step].enter();
  }, [active, step, which]);
  if (!active) return null;
  const s = STEPS_[step];
  const done = s.act?.done?.() ?? false;
  return (
    <div className="tour-card" role="dialog" aria-labelledby="tour-title" aria-live="polite" dir={ar ? 'rtl' : 'ltr'} lang={locale}>
      <div className="tour-head">
        <Compass size={15} aria-hidden />
        <span className="ops-small ops-muted">
          {which === 'parknex' ? 'PARKNEX demo' : ar ? 'جولة الحكام' : 'Judge tour'} · {step + 1} / {STEPS_.length}
        </span>
        <button className="icon-btn sm" aria-label={ar ? 'إعادة الجولة' : 'Restart tour'} title="Restart" onClick={() => go(0)}>
          <RotateCcw size={13} />
        </button>
        <button className="icon-btn sm" aria-label={ar ? 'إنهاء الجولة' : 'Exit tour'} onClick={stop}>
          <X size={13} />
        </button>
      </div>
      <h4 id="tour-title">{ar && s.titleAr ? s.titleAr : s.title}</h4>
      <p>{ar && s.bodyAr ? s.bodyAr : s.body}</p>
      {s.act && (
        <button className="ops-btn primary" disabled={done} onClick={s.act.run} data-state={runState}>
          {done ? (ar ? 'تمت الموافقة ✓' : 'Approved ✓') : ar ? 'وافق بصفة مشغّل' : s.act.label}
        </button>
      )}
      <div className="tour-nav">
        <button className="ops-btn" disabled={step === 0} onClick={() => go(step - 1)}>
          <ChevronLeft size={14} /> {ar ? 'السابق' : 'Back'}
        </button>
        <div className="tour-dots" aria-hidden>
          {STEPS_.map((_, i) => (
            <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} />
          ))}
        </div>
        {step < STEPS_.length - 1 ? (
          <button className="ops-btn primary" onClick={() => go(step + 1)}>
            {ar ? 'التالي' : 'Next'} <ChevronRight size={14} />
          </button>
        ) : (
          <button className="ops-btn primary" onClick={stop}>
            {ar ? 'إنهاء' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  );
}
