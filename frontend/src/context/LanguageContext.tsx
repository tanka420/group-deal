import React, { createContext, useContext, useState, useEffect } from "react";
import { Language, translations } from "../utils/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations.vi) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(()=>{
    try{const saved=localStorage.getItem("groupdeal_lang");if(saved==="vi"||saved==="en")return saved;}catch{}
    return "vi";
  });

  useEffect(() => {
    document.documentElement.lang=language;
  }, [language]);

  const handleSetLang = (lang: Language) => {
    setLanguage(lang);
    try{localStorage.setItem("groupdeal_lang", lang);}catch{}
  };

  const t = (key: keyof typeof translations.vi): string => {
    const dict = translations[language] || translations.vi;
    return dict[key] || translations.vi[key] || (key as string);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
