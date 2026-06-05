import { defineI18n } from "fumadocs-core/i18n"
import { i18nProvider, uiTranslations } from "fumadocs-ui/i18n"

export const i18n = defineI18n({
  languages: ["zh-CN", "en"],
  defaultLanguage: "zh-CN",
  parser: "dir",
  hideLocale: "never",
})

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add("ui", {
    "zh-CN": {
      displayName: "简体中文",
      search: "搜索",
      searchNoResult: "没有找到结果",
      toc: "本页目录",
      tocNoHeadings: "没有标题",
      tocInline: "目录",
      lastUpdate: "最后更新",
      chooseLanguage: "选择语言",
      nextPage: "下一页",
      previousPage: "上一页",
      chooseTheme: "主题",
      themeLight: "浅色",
      themeDark: "深色",
      themeSystem: "跟随系统",
      searchOpen: "打开搜索",
      searchClose: "关闭搜索",
      menuToggle: "切换菜单",
      sidebarOpen: "打开侧边栏",
      sidebarCollapse: "收起侧边栏",
      codeBlockCopy: "复制代码",
      codeBlockCopied: "已复制",
    },
    en: {
      displayName: "English",
    },
  })

export function docsI18nProvider(locale?: string) {
  return i18nProvider(translations, locale)
}
