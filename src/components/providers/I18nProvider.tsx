'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Locale, defaultLocale, t as translate, getDirection } from '@/lib/i18n';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
}

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
  t: (key) => key,
  dir: 'rtl',
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('felfel-locale', newLocale);
    document.documentElement.dir = getDirection(newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string) => translate(key, locale),
    [locale]
  );

  const dir = getDirection(locale);

  useEffect(() => {
    const saved = localStorage.getItem('felfel-locale') as Locale | null;
    if (saved && (saved === 'fa' || saved === 'en')) {
      setLocale(saved);
    } else {
      document.documentElement.dir = dir;
      document.documentElement.lang = locale;
    }
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
