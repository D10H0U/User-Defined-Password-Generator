// Clash 覆写脚本 v6：服务分组里按地区 × 自动/手动选节点
// 放法：配置中心 → 点进 Lee → 覆写 → 覆写脚本 groups → 把整份代码替换成这份，保存，刷新配置
// 每次订阅刷新自动跑一遍，分组不会丢
//
// v6 改动：每个 select 组再加一个 REJECT 选项（选了就是拒绝这路流量，
//   比如不想让某个服务走代理也不直连、直接拦掉）。
//   每个服务组现在是 14 个成员（12 个方向组 + DIRECT + REJECT）。
//   只改成员、不改组名（改名会断掉规则和服务组的指向）。
function main(config) {
  const all = (config.proxies || []).map(p => p.name);

  // 地区匹配（按这个顺序，先匹配到的先生效）
  const regions = [
    { name: "香港", flag: "🇭🇰", re: /港|\bHK\b|Hong\s?Kong/i },
    { name: "台湾", flag: "🇹🇼", re: /台|\bTW\b|Taiwan|Taipei|台北|台中|高雄/i },
    { name: "日本", flag: "🇯🇵", re: /日|\bJP\b|Japan|Tokyo|Osaka|东京|大阪/i },
    { name: "新加坡", flag: "🇸🇬", re: /新加坡|狮城|\bSG\b|Singapore/i },
    { name: "美国", flag: "🇺🇸", re: /美国|\bUS\b|America|United States|洛杉矶|旧金山|纽约|西雅图|芝加哥|达拉斯|圣何塞|拉斯维加斯|Los Angeles|San Francisco|New York|Seattle|Chicago|Dallas|San Jose|Las Vegas|California|Oregon|Virginia|Texas/i },
    { name: "英国", flag: "🇬🇧", re: /英|\bUK\b|London|伦敦|United Kingdom|Great Britain|England/i },
    { name: "韩国", flag: "🇰🇷", re: /韩|\bKR\b|Korea|Seoul|首尔/i },
  ];

  const used = new Set();
  const newGroups = [];
  const dirNames = []; // 地区方向组名，自动/手动成对
  const testUrl = "http://www.gstatic.com/generate_204";

  for (const r of regions) {
    const members = all.filter(n => r.re.test(n) && !used.has(n));
    members.forEach(n => used.add(n));
    if (!members.length) continue;
    const autoName = `${r.flag} ${r.name}自动`;
    const manualName = `${r.flag} ${r.name}手动`;
    newGroups.push({
      name: autoName, type: "url-test", proxies: members,
      url: testUrl, interval: 300, tolerance: 50, lazy: true,
    });
    newGroups.push({
      name: manualName, type: "select", proxies: members,
    });
    dirNames.push(autoName, manualName);
  }

  // 没匹配上任何地区的节点都进这里，不会丢节点
  const rest = all.filter(n => !used.has(n));
  if (rest.length) {
    newGroups.push({
      name: "🌐 其他地区自动", type: "url-test", proxies: rest,
      url: testUrl, interval: 300, tolerance: 50, lazy: true,
    });
    newGroups.push({
      name: "🌐 其他地区手动", type: "select", proxies: rest,
    });
    dirNames.push("🌐 其他地区自动", "🌐 其他地区手动");
  }

  // 全部节点：自动档测速选全部里最快的，手动档手选任意一个节点
  if (all.length) {
    newGroups.push({
      name: "🌍 全部自动", type: "url-test", proxies: [...all],
      url: testUrl, interval: 300, tolerance: 50, lazy: true,
    });
    newGroups.push({
      name: "🌍 全部手动", type: "select", proxies: [...all],
    });
    dirNames.push("🌍 全部自动", "🌍 全部手动");
  }

  // 清掉 v1 的旧地区组（🇭🇰 香港节点…）和同名组，避免重名报错
  const v1Names = ["🇭🇰 香港节点", "🇹🇼 台湾节点", "🇯🇵 日本节点", "🇸🇬 新加坡节点", "🇺🇸 美国节点", "🇬🇧 英国节点", "🇰🇷 韩国节点", "🌐 其他地区"];
  const removeNames = new Set([...v1Names, ...newGroups.map(g => g.name)]);
  const groups = (config["proxy-groups"] || []).filter(g => !removeNames.has(g.name));

  // 所有 select 组（总组 OpenAI、🚀 节点选择、Apple 等服务组）统一改成：
  //   12 个方向组（10 个地区组 + 2 个全部组）+ DIRECT + REJECT（共 14 个成员），不再保留 OpenAI 入口。
  // 改写时把 include-all / use 开关一起删掉，否则总组的成员缩不下来。
  // GLOBAL 是链路入口组，不动。
  for (const g of groups) {
    if (g.type !== "select" || g.name === "GLOBAL") continue;
    g.proxies = [...dirNames, "DIRECT", "REJECT"];
    delete g["include-all"];
    delete g["include-all-proxies"];
    delete g["include-all-providers"];
    delete g.use;
  }

  config["proxy-groups"] = [...groups, ...newGroups];
  return config;
}
