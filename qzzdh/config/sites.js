/**
 * 站点适配配置
 * ------------------------------------------------------------------
 * 每个求职网站的页面结构各不相同，这里集中维护各站点的 CSS 选择器，
 * content.js 会依据当前域名匹配对应的配置来抓取职位卡片信息并触发投递。
 *
 * 字段说明：
 *   name              站点名称（用于日志与 UI 展示）
 *   listUrlPattern    命中职位列表页的 URL 正则（命中才会启用面板）
 *   cardSelector      单个职位卡片的选择器
 *   titleSelector     职位名称
 *   companySelector   公司名称
 *   locationSelector  工作地区（可选，缺省时从卡片全文解析）
 *   salarySelector    薪资（可选）
 *   tagSelectors      经验/学历等标签（数组，依次尝试）
 *   applySelector     卡片内可直接点击的“投递/沟通”按钮
 *   detailSelector    职位详情链接（用于点开后再投递的站点）
 *   scrollContainer   滚动加载容器（可选，默认 window）
 *
 * 注意：网站 DOM 经常改版，若选择器失效只需在此处更新即可。
 *       若某个站点未配置，content.js 会退化为“通用解析模式”。
 */
(function (global) {
  'use strict';

  const SITES = {
    // ----------------------------------------------------------------
    // BOSS 直聘
    // ----------------------------------------------------------------
    zhipin: {
      name: 'BOSS直聘',
      host: /(^|\.)zhipin\.com$/i,
      // BOSS 列表卡片上没有直接投递按钮，“立即沟通”在详情页；
      // 因此用 queue-detail 模式：列表收集详情链接 -> 后台逐页打开 -> 详情页自动点“立即沟通”。
      mode: 'queue-detail',
      listUrlPattern: /\/web\/geek\/job/i,
      detailUrlPattern: /\/job_detail\//i,
      // 用于“按详情链接聚类”自适应发现职位列表（应对类名混淆）
      detailHrefKeyword: 'job_detail',
      // 主搜索结果列表在前（徽章直接渲染在卡片内）；排除推荐位/列表容器自身，避免混扫
      cardSelector: '.search-job-result ul.job-list-box > li, .job-list-box > li.job-card-box, .job-list-box > li, .job-card-wrapper, [class*="job-card-wrapper"]:not([class*="job-list"])',
      titleSelector: '.job-name, .job-title .job-name, [class*="job-name"]',
      companySelector: '.company-name a, .company-name',
      locationSelector: '.job-area, .job-area-wrapper .job-area',
      salarySelector: '.salary',
      // .job-info .tag-list li 前两项分别为：工作经验、学历要求
      tagSelectors: ['.job-info .tag-list li', '.tag-list li'],
      applySelector: null, // 列表卡片无直接投递按钮
      detailSelector: 'a[href*="job_detail"], a.job-card-left, .job-primary a[href*="job_detail"]',
      // 详情页“立即沟通/继续沟通”按钮（多重选择器 + 文案兜底）
      applyOnDetailSelector: '.btn-startchat, a[ka="job_detail_chat"], .op-btn-chat, .job-op .btn-startchat, .btn.btn-startchat',
      scrollContainer: '.search-job-result .job-list-box, .search-job-result'
    },

    // ----------------------------------------------------------------
    // 智联招聘
    // ----------------------------------------------------------------
    zhaopin: {
      name: '智联招聘',
      host: /(^|\.)zhaopin\.com$/i,
      listUrlPattern: /sou|jobsearch|search/i,
      cardSelector: '.joblist-box__item, .contentpile__content__wrapper__item, .positionlist .position-item',
      titleSelector: '.iteminfo__line1__jobname, .joblist-box__iteminfo__line1__jobname, .position-item__title',
      companySelector: '.iteminfo__line1__compname, .joblist-box__iteminfo__line1__compname, .position-item__company',
      locationSelector: '.iteminfo__line2__jobdesc__demand, .joblist-box__iteminfo__line2__jobdesc__demand',
      salarySelector: '.iteminfo__line2__jobdesc__salary, .joblist-box__iteminfo__line2__jobdesc__salary',
      tagSelectors: ['.iteminfo__line2__jobdesc__tag span', '.joblist-box__iteminfo__line2__jobdesc__tag span'],
      applySelector: '.btn-apply, [class*="apply"], .joblist-box__itemoperate a',
      detailSelector: '.iteminfo__line1__jobname a, .joblist-box__iteminfo a, .position-item__title a',
      scrollContainer: '.joblist-box, .sou-main'
    },

    // ----------------------------------------------------------------
    // 前程无忧
    // ----------------------------------------------------------------
    job51: {
      name: '前程无忧',
      host: /(^|\.)51job\.com$/i,
      listUrlPattern: /sou|search|jobsearch/i,
      cardSelector: '.j_joblist .e, .joblist .el, .j_joblist div[class*="e"]',
      titleSelector: '.jname .t, .job-title, .el .t span',
      companySelector: '.cname .t, .company-name, .el .c span',
      locationSelector: '.d .at, .dc .at, .info-area',
      salarySelector: '.sal, .salary, .d .sal',
      tagSelectors: ['.d .dc span', '.tags span', '.int_taglist span'],
      applySelector: '.btn-apply, [class*="apply"], .op .btn',
      detailSelector: '.jname a, .el .t a, a[href*="job.51job.com"]',
      scrollContainer: '.j_joblist, .joblist'
    },

    // ----------------------------------------------------------------
    // 猎聘
    // ----------------------------------------------------------------
    liepin: {
      name: '猎聘',
      host: /(^|\.)liepin\.com$/i,
      listUrlPattern: /zhaopin|job|search/i,
      cardSelector: '.job-card, .joblist .job-card-wrap, div[class*="JobCard"]',
      titleSelector: '.ellipsis-1 .job-title-box, .job-title, h3.ellipsis-1',
      companySelector: '.company-name, .comp-name',
      locationSelector: '.job-dq, .dq',
      salarySelector: '.job-salary, .salary',
      tagSelectors: ['.labels span', '.tag-list span', '.job-labels span'],
      applySelector: '.btn-apply, [class*="apply"], a[data-selector="apply"]',
      detailSelector: '.job-title-box a, h3 a, .ellipsis-1 a',
      scrollContainer: '.joblist-box, .job-list'
    },

    // ----------------------------------------------------------------
    // 拉勾
    // ----------------------------------------------------------------
    lagou: {
      name: '拉勾',
      host: /(^|\.)lagou\.com$/i,
      listUrlPattern: /jobs|wn\/jobs|zhaopin/i,
      cardSelector: '.item__10RTO, .position-list-item, div[class*="itemContent"]',
      titleSelector: '.p-top__1F7CL .p-top__1F7CL a, .position-title, .p-top a',
      companySelector: '.company-name__2-Sj, .company-name',
      locationSelector: '.add__2yRoS, .position-city, .p-bottom',
      salarySelector: '.money__3fhkg, .salary',
      tagSelectors: ['.tags__2Pltr span', '.position-tags span'],
      applySelector: '.btn-apply, [class*="deliver"], .p-bottom__1YH0z button',
      detailSelector: '.p-top__1F7CL a, .position-title a',
      scrollContainer: '.position-list, .s-job-list'
    }
  };

  /**
   * 通用解析模式的兜底选择器
   * 未命中任何站点配置时，content.js 会尝试用这些宽泛选择器抓取卡片。
   */
  const GENERIC = {
    name: '通用模式',
    cardSelector: '[class*="job-card"], [class*="job-item"], [class*="position-item"], [class*="jobCard"], li[class*="job"]',
    titleSelector: '[class*="title"], [class*="name"], h3, h2',
    companySelector: '[class*="company"], [class*="comp"]',
    locationSelector: '[class*="area"], [class*="city"], [class*="location"]',
    salarySelector: '[class*="salary"], [class*="money"], [class*="pay"]',
    tagSelectors: ['[class*="tag"] span', '[class*="desc"] span'],
    applySelector: '[class*="apply"], [class*="deliver"], [class*="chat"]',
    detailSelector: 'a'
  };

  // ------------------------------------------------------------------
  // 经验 / 学历 关键词词典（用于从卡片文本中解析与筛选）
  // ------------------------------------------------------------------
  const EXPERIENCE_KEYWORDS = {
    '应届': ['应届', '在校生', '应届毕业', '无经验', '经验不限'],
    '1年以下': ['1年以下', '1年以内', '一年以下', '一年以内', '少于1年'],
    '1-3年': ['1-3年', '1—3年', '一至三年', '1~3年'],
    '3-5年': ['3-5年', '3—5年', '三至五年', '3~5年'],
    '5-10年': ['5-10年', '5—10年', '五至十年', '5~10年'],
    '10年以上': ['10年以上', '十年以上', '10年+']
  };

  const EDUCATION_KEYWORDS = {
    '学历不限': ['学历不限', '不限学历'],
    '初中及以下': ['初中'],
    '高中/中专': ['高中', '中专', '中技'],
    '大专': ['大专', '专科'],
    '本科': ['本科', '统招本科'],
    '硕士': ['硕士', '研究生'],
    '博士': ['博士', '博士后']
  };

  global.QZZDH_SITES = SITES;
  global.QZZDH_GENERIC = GENERIC;
  global.QZZDH_EXP_KEYWORDS = EXPERIENCE_KEYWORDS;
  global.QZZDH_EDU_KEYWORDS = EDUCATION_KEYWORDS;
})(typeof window !== 'undefined' ? window : this);
