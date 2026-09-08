'use client';

import { useId, useRef } from 'react';
import { LuCoins, LuListChecks, LuMessagesSquare, LuRoute, LuShare2, LuUserPlus, LuUsers, LuX } from 'react-icons/lu';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import styles from './collaborative-trip.module.css';

const planningCapabilities = [
  ['plan', 'خططوا الرحلة معًا', 'Plan together', LuRoute],
  ['invite', 'دعوة المسافرين', 'Invite travellers', LuUserPlus],
  ['participants', 'المشاركون', 'Participants', LuUsers],
  ['conversation', 'المحادثة المشتركة مع الدبرة', 'Shared DABRA conversation', LuMessagesSquare],
  ['choices', 'الاختيارات المشتركة', 'Shared choices', LuListChecks],
] as const;

const collectionCapabilities = [
  ['share', 'مشاركة الرحلة', 'Share trip', LuShare2],
  ['invite', 'دعوة المسافرين', 'Invite travellers', LuUserPlus],
  ['participants', 'المشاركون', 'Participants', LuUsers],
  ['collection', 'القَطّة / مشاركة تكلفة الرحلة', 'Collect from friends', LuCoins],
] as const;

/** Product preview only: no trip data, membership, sharing or payment authority. */
export default function CollaborativeTripCapabilities({ phase }: { phase: 'planning' | 'collection' }) {
  const { language, direction } = useLanguage();
  const ar = language === 'ar';
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const soon = ar ? 'قريبًا' : 'Coming soon';
  const planning = phase === 'planning';
  const capabilities = planning ? planningCapabilities : collectionCapabilities;
  const message = planning
    ? (ar ? 'ستتمكن من دعوة رفاق الرحلة والتخطيط معًا في نفس الرحلة ومشاركة نفس محادثة الدبرة والاختيارات.' : 'You’ll be able to invite fellow travellers, plan the same trip together, and share the same DABRA conversation and trip choices.')
    : (ar ? 'بعد دفع الحجز كاملًا وتأكيده، ستتمكن من إرسال روابط لرفاق الرحلة لتحصيل مساهماتهم في تكلفة الرحلة.' : 'After you pay the booking in full and it is confirmed, you’ll be able to send contribution links to fellow travellers to collect their share of the trip cost.');

  return <section className={styles.section} lang={language} dir={direction} aria-labelledby={`${id}-title`} data-collaborative-trip={phase} data-dabra-avoid>
    <div className={styles.heading}>
      <div>
        <h2 id={`${id}-title`}>{planning ? (ar ? 'خططوا معًا' : 'Plan together') : (ar ? 'سافروا معًا' : 'Travel together')}</h2>
        <p className={styles.supporting}>{planning
          ? (ar ? 'ادعُ رفاق الرحلة وشاركوا التخطيط والاختيارات.' : 'Invite your travel companions and plan and choose together.')
          : (ar ? 'شاركوا تفاصيل الرحلة وتواصلوا طوال الرحلة.' : 'Share trip details and stay connected throughout the journey.')}</p>
      </div>
      <span className={styles.preview}>{soon}</span>
    </div>
    <div className={styles.grid}>
      {capabilities.map(([key, arabic, english, Icon]) => <button
        key={key}
        type="button"
        className={styles.capability}
        aria-haspopup="dialog"
        aria-controls={`${id}-dialog`}
        data-trip-capability={key}
        onClick={event => { opener.current = event.currentTarget; dialog.current?.showModal(); }}
      >
        <Icon strokeWidth={1.75} aria-hidden="true" />
        <span>{ar ? arabic : english}</span>
      </button>)}
    </div>
    <dialog ref={dialog} id={`${id}-dialog`} className={styles.dialog} aria-labelledby={`${id}-soon`} aria-describedby={`${id}-message`} onClose={() => opener.current?.focus()} onKeyDown={event => {
      // This informational dialog has one focusable control: keep Tab on Close.
      if (event.key === 'Tab') { event.preventDefault(); event.currentTarget.querySelector('button')?.focus(); }
    }}>
      <button type="button" className={styles.close} aria-label={ar ? 'إغلاق' : 'Close'} onClick={() => dialog.current?.close()}><LuX strokeWidth={1.75} aria-hidden="true" /></button>
      <h3 id={`${id}-soon`}>{soon}</h3>
      <p id={`${id}-message`}>{message}</p>
    </dialog>
  </section>;
}
