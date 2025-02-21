import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Mousetrap from "mousetrap";
import { usePort } from "@plasmohq/messaging/hook";
import { ArrowRight, Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { LanguageEnum, Languages, MAX_TRANSLATION_LENGTH } from "@/config/common";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { debounce, uniqueId } from "lodash-es";
import { useStorage } from "@plasmohq/storage/hook";
import { StorageKeys } from "@/config/storage";

import cssText from "data-text:@/styles/globals.css";
import { MessageTypes } from "@/config/message";

export const getStyle = () => {
  const style = document.createElement("style");
  style.textContent = cssText;
  return style;
};

const Entry = () => {
  const aiPort = usePort("ai");
  const [sourceText, setSourceText] = useState("");
  const [textId, setTextId] = useState("");
  const [targetText, setTargetText] = useState("");
  const [showEntryPanel, setShowEntryPanel] = useState(false);
  const [sourceTextRect, setSourceTextRect] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [targetLanguage, setTargetLanguage] = useStorage(StorageKeys.TARGET_LANGUAGE, (value) => {
    if (value === undefined) return LanguageEnum.English;
    return value;
  });

  // bottom middle of the selected text
  const entryPanelPosition = useMemo(() => {
    return {
      x: sourceTextRect.left + (sourceTextRect.right - sourceTextRect.left) / 2,
      y: sourceTextRect.bottom + 10
    };
  }, [sourceTextRect.left, sourceTextRect.right, sourceTextRect.bottom]);

  const getTranslatedText = async (selectedText: string) => {
    const id = uniqueId();
    setTextId(id);
    setTargetText("");
    setSourceText(selectedText);

    aiPort.send({
      uniqueId: id,
      text: selectedText || sourceText
    });
  };

  const handleTargetLanguageChange = (language: LanguageEnum) => {
    setTargetLanguage(language);
    getTranslatedText(sourceText);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const listener = aiPort.listen((message) => {
      const { messageType, data } = message;

      if (messageType === MessageTypes.TRANSLATE_TEXT_PART) {
        const { uniqueId, text } = data;
        if (uniqueId !== textId) return;

        setTargetText((prev) => {
          return prev + text;
        });
      }

      if (messageType === MessageTypes.TRANSLATE_TEXT_ERROR) {
        const { uniqueId, error } = data;
        if (uniqueId !== textId) return;

        setTargetText(error.message);
      }
    });

    return () => listener.disconnect();
  }, [textId]);

  // get text from selection and show entry panel
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    Mousetrap.bind("option+n", () => {
      const selection = window.getSelection();
      if (!selection) return;

      const { isCollapsed } = selection;

      // no text selected
      if (isCollapsed) {
        setShowEntryPanel(false);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const { left, right, top, bottom } = rect;

      let selectedText = selection.toString().trim();
      selectedText = selectedText.slice(0, MAX_TRANSLATION_LENGTH);

      setShowEntryPanel(true);
      setSourceTextRect({ left, right, top, bottom });
      getTranslatedText(selectedText);
    });
  }, []);

  // update entry panel position when scrolling the page
  useEffect(() => {
    const handleScroll = debounce(() => {
      if (!showEntryPanel) return;

      const selection = window.getSelection();
      if (!selection) return;

      const { isCollapsed } = selection;

      // no text selected
      if (isCollapsed) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const { left, right, top, bottom } = rect;

      setSourceTextRect({ left, right, top, bottom });
    }, 100);

    document.addEventListener("scroll", handleScroll);
    return () => document.removeEventListener("scroll", handleScroll);
  }, [showEntryPanel]);

  // hide entry panel when click outside
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      // do not hide if click on the extension element
      const target = event.target as HTMLElement;
      if (target.localName === "plasmo-csui") return;

      setShowEntryPanel(false);
      setSourceTextRect({ left: 0, right: 0, top: 0, bottom: 0 });
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  return (
    <>
      <AnimatePresence>
        {showEntryPanel && (
          <motion.div
            id="entry-panel-container"
            className="fixed w-96 py-2 px-3 border border-gray-200 shadow-lg rounded-md -translate-x-1/2"
            initial={{ opacity: 0, x: entryPanelPosition.x, y: entryPanelPosition.y }}
            animate={{ opacity: 1, x: entryPanelPosition.x, y: entryPanelPosition.y }}
            exit={{ opacity: 0 }}
          >
            <div className="min-h-6">{targetText}</div>
            <Separator className="mt-3 mb-1.5" />
            <div className="flex items-center">
              <Button disabled variant="outline" size={"sm"} className={cn("justify-between", !targetLanguage && "text-muted-foreground")}>
                <div className="w-24 overflow-hidden overflow-ellipsis text-left">Any Language</div>
                <ChevronsUpDown className="opacity-50" />
              </Button>
              <ArrowRight size={20} className="mx-2" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size={"sm"} className={cn("w-28 justify-between", !targetLanguage && "text-muted-foreground")}>
                    <div className="overflow-hidden overflow-ellipsis text-left">{Languages.find((language) => language.value === targetLanguage)?.label}</div>
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-28 p-0 bg-transparent backdrop-blur-2xl">
                  <Command>
                    <CommandInput placeholder="Search" className="h-9" />
                    <CommandList>
                      <CommandEmpty>No language found.</CommandEmpty>
                      <CommandGroup>
                        {Languages.map((language) => (
                          <CommandItem value={language.label} key={language.value} onSelect={() => handleTargetLanguageChange(language.value)}>
                            {language.label}
                            <Check className={cn("ml-auto", language.value === targetLanguage ? "opacity-100" : "opacity-0")} />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Entry;
