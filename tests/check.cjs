const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync('dist/edgeos-zh-cn.user.js', 'utf8');
let passed = 0;
function ok(condition, message) { assert.ok(condition, message); console.log('PASS', ++passed, message); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function environment(body, url = 'https://192.168.1.1/#Dashboard', title = 'EdgeOS - Test') {
  const dom = new JSDOM(`<!doctype html><title>${title}</title><body>${body}</body>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  let frames = 0, observerCalls = 0, requests = 0;
  const nativeFrame = dom.window.requestAnimationFrame.bind(dom.window);
  dom.window.requestAnimationFrame = cb => { frames++; return nativeFrame(cb); };
  const NativeObserver = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends NativeObserver {
    constructor(cb) { super(records => { observerCalls++; cb(records); }); }
  };
  dom.window.fetch = () => { requests++; throw Error('Unexpected network request'); };
  dom.window.XMLHttpRequest = class { constructor() { requests++; throw Error('Unexpected network request'); } };
  return { dom, window: dom.window, document: dom.window.document, run: () => dom.window.eval(script), counts: () => ({ frames, observerCalls, requests }) };
}
// Independently authored fixtures reproduce the DOM contracts without bundling vendor templates.
function template(file) {
  if (file === 'tree') return '<label><span class="text" for="description">description</span></label><div><input type="text"></div>';
  if (file === '_dialog') return '<div id="ConfirmationDialog"><div class="message"></div></div>';
  throw Error('Unknown test fixture: '+file);
}
(async () => {
  const e = environment(`<nav id="Navigation"><a href="#Services" data-tooltip="Services">Services</a></nav>
    <div id="Welcome"><span class="full-name">Save</span></div>
    <h2>Interfaces</h2><button id="save" type="button"><span>Save</span></button>
    <form id="f"><label for="name">Description</label><input name="description" id="name" value="Save" placeholder="Description">
    <input type="password" name="password" value="Apply"><textarea name="config">Delete</textarea>
    <select name="protocol"><option>Static</option><option value="dhcp" selected>Use DHCP</option></select></form>
    <table><thead><tr><th>Description</th><th>Interface</th><th>Status</th></tr></thead>
    <tbody><tr><td class="description">Save</td><td class="id">eth0</td><td class="status">connected</td><td class="buttons"><button>Actions</button></td></tr></tbody></table>
    <dl><dt>Hostname</dt><dd>Save</dd><dd class="bool">enabled</dd></dl>
    <div id="ConfigTree"><label>description</label><pre class="cmds">set service dns forwarding cache-size 1000</pre><button>Preview</button></div>
    <div class="uptime">4 months, 1 week, 5 days</div><h3 id="interface-title">Interface Configuration for eth2</h3>
    <div class="service routing"><dl><dt id="direct-route">connected</dt></dl></div>
    <h4 id="ruleset-title">Ruleset Configuration for Save</h4>
    <div class="terminal">Save</div><div contenteditable="true">Apply</div>
    <script type="text/template" id="source"><button>Delete</button></script>
    <div class="dataTables_info">Showing <span>1</span> to <span>7</span> of <span>7</span> entries</div>
    <svg><text id="rate">Tx Rate (Mbps)</text><text id="host">Save</text></svg>`);
  const {document:d,window:w} = e;
  const before = Array.from(new w.FormData(d.getElementById('f')).entries());
  const button = d.getElementById('save');
  let clicks = 0; button.addEventListener('click', () => clicks++);
  e.run(); await sleep(70);
  ok(d.querySelector('h2').textContent === '网络接口' && button.textContent === '保存', 'static headers/buttons translated');
  ok(d.querySelector('#Navigation a').title === '服务' && d.querySelector('#Navigation a').getAttribute('data-tooltip') === 'Services', 'Chinese navigation hint added; original tooltip metadata preserved');
  ok(JSON.stringify(Array.from(new w.FormData(d.getElementById('f')).entries())) === JSON.stringify(before), 'submitted form values, password and implicit option values unchanged');
  ok(d.querySelector('option[value="dhcp"]').textContent === '使用 DHCP' && d.querySelector('option:not([value])').textContent === 'Static' && d.querySelector('select').value === 'dhcp', 'explicit-value option captions translated; implicit-value captions and selected value preserved');
  ok(d.querySelector('.uptime').textContent === '4个月 1周 5天' && d.getElementById('interface-title').textContent === '接口配置：eth2' && d.getElementById('ruleset-title').textContent === '规则集配置：Save', 'duration and dynamic dialog titles translated while parameter names are preserved');
  ok(d.getElementById('direct-route').textContent === '直连', 'connected routes use the correct routing term');
  ok(d.getElementById('name').placeholder === '描述', 'display placeholder translated without modifying value');
  ok(d.querySelector('td.description').textContent === 'Save' && d.querySelector('td.id').textContent === 'eth0' && d.querySelector('.full-name').textContent === 'Save' && d.querySelector('dd:not(.bool)').textContent === 'Save', 'user descriptions, interface ID, username and device data preserved');
  ok(d.querySelector('td.status').textContent === '已连接' && d.querySelector('dd.bool').textContent === '已启用', 'only explicit status cells translated');
  ok(d.querySelector('#ConfigTree label').textContent === 'description' && d.querySelector('.cmds').textContent.includes('cache-size 1000') && d.querySelector('#ConfigTree button').textContent === '预览', 'configuration parameter names and command output preserved');
  ok(d.querySelector('.terminal').textContent === 'Save' && d.querySelector('[contenteditable]').textContent === 'Apply' && d.getElementById('source').textContent === '<button>Delete</button>', 'terminal, editable text and application templates preserved');
  button.click(); ok(clicks === 1 && d.getElementById('save') === button && button.querySelector('span'), 'original node, markup and click listener preserved');
  ok(d.querySelector('.dataTables_info').textContent.includes('显示第 1 至 7 条，共 7 条') && d.getElementById('rate').textContent === '发送速率（Mbps）' && d.getElementById('host').textContent === 'Save', 'fragmented counters and chart labels handled without touching host labels');
  const dynamic = d.createElement('div'); dynamic.innerHTML = '<label>Cache Size</label><button>Apply</button><input value="1000">'; d.body.append(dynamic);
  await sleep(70);
  ok(dynamic.querySelector('label').textContent === '缓存大小' && dynamic.querySelector('button').textContent === '应用' && dynamic.querySelector('input').value === '1000', 'new dialog translated asynchronously; entered value preserved');
  d.querySelector('td.status').firstChild.data = 'disconnected'; await sleep(70);
  ok(d.querySelector('td.status').textContent === '未连接', 'application status refresh translated again');
  d.querySelector('.uptime').firstChild.data = '4 months, 1 week, 6 days';await sleep(70);
  ok(d.querySelector('.uptime').textContent === '4个月 1周 6天', 'periodically refreshed uptime continues to translate');
  const extraOption=d.createElement('option');extraOption.value='manual';extraOption.textContent='Manually define IP address';d.querySelector('select').append(extraOption);await sleep(70);
  ok(extraOption.textContent==='手动设置 IP 地址' && extraOption.value==='manual' && d.querySelector('select').value==='dhcp', 'new dropdown option translated without changing selection');
  const toggle = d.getElementById('edgeos-zh-toggle'); toggle.click();
  ok(button.textContent === 'Save' && dynamic.querySelector('label').textContent === 'Cache Size' && d.querySelector('td.status').textContent === 'disconnected' && d.getElementById('name').placeholder === 'Description', 'English toggle restores latest source text and attributes');
  ok(extraOption.textContent === 'Manually define IP address' && d.querySelector('option[value="dhcp"]').textContent==='Use DHCP' && d.querySelector('.uptime').textContent==='4 months, 1 week, 6 days', 'English toggle restores option captions and latest uptime');
  toggle.click(); await sleep(70); ok(button.textContent === '保存', 'Chinese can be re-enabled without reloading');
  d.querySelector('#Navigation a').setAttribute('data-tooltip','Routing');await sleep(70);
  ok(d.querySelector('#Navigation a').title === '路由' && d.querySelector('#Navigation a').getAttribute('data-tooltip') === 'Routing', 'updated navigation metadata retained while Chinese hint updates');
  toggle.click();ok(!d.querySelector('#Navigation a').hasAttribute('title'), 'generated navigation hint is removed in English mode');toggle.click();await sleep(70);
  e.run(); ok(d.querySelectorAll('#edgeos-zh-toggle').length === 1, 'duplicate script load creates no extra observer/control');
  await sleep(70); const frameCount=e.counts().frames;
  const counter=d.createElement('span'); counter.className='rx';counter.textContent='123 Mbps';d.body.append(counter);await sleep(70);
  const afterAdd=e.counts().frames;
  for(let i=0;i<300;i++) counter.firstChild.data=`${i} Mbps`;
  await sleep(70);
  ok(e.counts().frames === afterAdd && e.counts().observerCalls < 40 && e.counts().requests === 0, '300 numeric updates cause no rescans or network requests; observer does not loop');
  for (const [url,title] of [['http://192.0.2.1/','EdgeOS'],['https://example.com/','EdgeOS'],['https://192.168.1.1/cli','EdgeOS'],['https://192.168.1.1/','Example Gateway']]) {
    const x=environment('<button>Save</button>',url,title);x.run();
    ok(x.document.querySelector('button').textContent==='Save' && !x.document.getElementById('edgeos-zh-toggle'), `scope guard: ${url} / ${title}`);x.window.close();
  }
  w.close();
  const audit=environment('<div id="TrafficAnalysisUserGraph"><div class="notation"><span class="host" id="chart-empty">No data available</span><span class="percentage"></span></div><div class="notation"><span class="host" id="actual-host">Local</span></div></div>' +
    '<div id="RoutingStatic"><div id="RoutingStaticRouteFilters"><a href="#Routing/Static/filter/connected">Connected</a></div><table><tr><td class="selected">Yes</td><td class="fib">No</td><td class="type">connected</td><td class="description">connected</td><td class="interface">eth2</td></tr></table></div>' +
    '<div id="SecurityFirewallPolicies"><table><tr><td class="default">drop</td><td class="name">drop</td></tr></table></div>' +
    '<div id="UsersLocal"><table><tr><td class="level">admin</td><td class="name">admin</td><td class="status">Active</td><td class="uptime">01h 46m 05s</td><td class="date">October 5, 2026</td></tr></table></div>' +
    '<div id="elsewhere"><span class="host">No data available</span><table><tr><td class="type">connected</td><td class="selected">Yes</td><td class="default">drop</td><td class="date">October 5, 2026</td></tr></table></div>' +
    '<label id="example" data-infotip="IPv4 address<br />Example: <b>192.0.2.1</b>">DNS 1</label><img id="theme" alt="Light Theme"><span title="PoE: activate to sort column ascending"></span>');
  const au=audit.document;
  audit.run();await sleep(70);
  ok(au.getElementById('chart-empty').textContent==='暂无数据' && au.getElementById('actual-host').textContent==='Local' && au.querySelector('#elsewhere .host').textContent==='No data available', 'real chart empty caption translated while host names and matching text elsewhere stay untouched');
  ok(au.querySelector('#RoutingStatic .selected').textContent==='是' && au.querySelector('#RoutingStatic .fib').textContent==='否' && au.querySelector('#RoutingStatic .type').textContent==='直连' && au.querySelector('#RoutingStaticRouteFilters a').textContent==='直连' && au.querySelector('#RoutingStatic .description').textContent==='connected' && au.querySelector('#RoutingStatic .interface').textContent==='eth2', 'route UI enums translated only in known columns; descriptions and interface IDs preserved');
  ok(au.querySelector('#SecurityFirewallPolicies .default').textContent==='丢弃' && au.querySelector('#SecurityFirewallPolicies .name').textContent==='drop' && au.querySelector('#UsersLocal .level').textContent==='管理员' && au.querySelector('#UsersLocal .name').textContent==='admin' && au.querySelector('#UsersLocal .status').textContent==='活跃', 'firewall defaults and user enums translated without changing rule names or usernames');
  ok(au.querySelector('#UsersLocal .date').textContent==='2026年10月5日' && au.querySelector('#UsersLocal .uptime').textContent==='01小时 46分钟 05秒' && au.querySelector('#elsewhere .date').textContent==='October 5, 2026' && au.querySelector('#elsewhere .type').textContent==='connected' && au.querySelector('#elsewhere .default').textContent==='drop', 'user date and duration formatting is scoped to actual user columns');
  ok(au.getElementById('example').title==='IPv4 地址\n示例：192.0.2.1' && au.getElementById('example').getAttribute('data-infotip').includes('<b>192.0.2.1</b>') && au.getElementById('theme').alt==='浅色主题', 'tooltip examples and theme alt text translated while HTML metadata and addresses remain unchanged');
  au.querySelector('#UsersLocal .uptime').firstChild.data='01h 47m 06s'; au.querySelector('#RoutingStatic .type').firstChild.data='kernel'; await sleep(70);
  ok(au.querySelector('#UsersLocal .uptime').textContent==='01小时 47分钟 06秒' && au.querySelector('#RoutingStatic .type').textContent==='内核路由', 'refreshes containing one-letter time units and route types retranslate correctly');
  au.getElementById('chart-empty').firstChild.data='Save';await sleep(70);
  ok(au.getElementById('chart-empty').textContent==='Save', 'a real host replacing the empty caption is preserved');
  au.getElementById('chart-empty').firstChild.data='No data available';await sleep(70);
  ok(au.getElementById('chart-empty').textContent==='暂无数据', 'chart caption translates again after returning to empty state');
  au.getElementById('edgeos-zh-toggle').click();
  ok(au.getElementById('chart-empty').textContent==='No data available' && au.querySelector('#UsersLocal .uptime').textContent==='01h 47m 06s' && au.querySelector('#RoutingStatic .type').textContent==='kernel' && au.getElementById('theme').alt==='Light Theme' && !au.getElementById('example').hasAttribute('title'), 'English restores latest chart, user, route and alt text');
  audit.window.close();
  const uiTerms=JSON.parse(fs.readFileSync('locales/ui.json','utf8'));
  const messages=Object.keys(uiTerms).filter(k=>/^No (?:DHCP servers configured|ONU available|alerts|areas available|filters available|groups available|interfaces available|interfaces configured for OSPF|leases assigned|mappings available|queue type found|results available|routes available|rules available|rulesets available|stats available|users available)\.$/.test(k));
  const allEmpty=environment('<table>' + messages.map(message=>`<tr><td class="dataTables_empty">${message}</td><td>${message}</td></tr>`).join('') + '</table>');
  allEmpty.run();await sleep(70);
  ok([...allEmpty.document.querySelectorAll('td.dataTables_empty')].every(cell=>/[\u4e00-\u9fff]/.test(cell.textContent)) && [...allEmpty.document.querySelectorAll('td:not(.dataTables_empty)')].every((cell,i)=>cell.textContent===messages[i]), 'supported empty-state messages translate while identical ordinary data cells remain untouched');
  allEmpty.window.close();
  const wizard=environment('<div id="Wizard"><form id="setup"><h2>User setup</h2><label>Use default user</label><input name="user" value="admin"><input type="password" name="password" value="Send"><label>Confirm Password</label><select name="connection"><option value="pppoe" selected>PPPoE</option><option value="static">Static IP</option></select><p>It will generate a new configuration, completely replacing the existing configuration. A reboot is required for the new configuration to take effect.</p><p><span>Connect eth0</span><span>and</span><span>eth4</span></p></form></div><span id="outside-and">and</span>');
  const wz=wizard.document;
  const submitted=JSON.stringify(Array.from(new wizard.window.FormData(wz.getElementById('setup')).entries()));
  wizard.run();await sleep(70);
  ok(wz.body.textContent.includes('完全替换现有配置') && wz.body.textContent.includes('重启后才能生效') && wz.body.textContent.includes('确认密码') && wz.querySelector('option[value="static"]').textContent==='静态 IP' && JSON.stringify(Array.from(new wizard.window.FormData(wz.getElementById('setup')).entries()))===submitted, 'wizard warning, labels and explicit option text translate without changing credentials or selections');
  ok(wz.querySelector('#setup p:last-child').textContent==='将 eth0和eth4' && wz.getElementById('outside-and').textContent==='and', 'interface IDs survive fragmented wizard descriptions and connector translation stays in Wizard');
  wizard.window.close();
  const corpus=JSON.parse(fs.readFileSync('tests/fixtures/dialog-corpus.json','utf8'));
  const uiStrings=[...corpus.dialogs,...Object.values(corpus.notices)];
  const corpusEnv=environment('<div class="ui-dialog" id="corpus"></div>');
  const corpusRoot=corpusEnv.document.getElementById('corpus');
  uiStrings.forEach(message=>{const p=corpusEnv.document.createElement('p');p.textContent=message;corpusRoot.append(p)});
  corpusEnv.run();await sleep(70);
  ok([...corpusRoot.children].every(p=>/[\u4e00-\u9fff]/.test(p.textContent)), 'all 39 complete dialog strings and 86 complete notice strings translate');
  corpusEnv.document.getElementById('edgeos-zh-toggle').click();
  ok([...corpusRoot.children].every((p,i)=>p.textContent===uiStrings[i]), 'English restores the full source-derived dialog and notice corpus');
  corpusEnv.window.close();
  const popup=environment('<div class="ui-dialog"><span id="popup-title" class="ui-dialog-title">Change Traffic Analysis Operational Status</span>'+template('_dialog','ConfirmationDialogTemplate')+'<button id="confirm-yes" type="button">Yes</button><button id="confirm-no" type="button">No</button></div><div id="TrafficAnalysisUserGraph"><div class="summary"><table><tr><td id="chart-bytes">0 bytes</td></tr></table></div></div><table><tr><td id="other-bytes">0 bytes</td></tr></table>');
  const pd=popup.document, message=pd.querySelector('#ConfirmationDialog .message');
  message.textContent='Enable traffic analysis with application identification using Deep Packet Inspection (DPI)?';
  let yesCalls=0,noCalls=0;
  pd.getElementById('confirm-yes').addEventListener('click',()=>yesCalls++);
  pd.getElementById('confirm-no').addEventListener('click',()=>noCalls++);
  popup.run();await sleep(70);
  ok(pd.getElementById('popup-title').textContent==='更改流量分析运行状态' && message.textContent==='是否启用流量分析，并通过深度包检测（DPI）识别应用？' && pd.getElementById('confirm-yes').textContent==='是' && pd.getElementById('confirm-no').textContent==='否', 'screenshot DPI dialog reproduces with translated title, full message and both buttons');
  pd.getElementById('confirm-no').click();
  ok(noCalls===1 && yesCalls===0, 'translated No button retains its original cancellation callback without running confirmation');
  const examples=[
    ['Are you sure you want to disable interface eth2 ?', '确定禁用接口 eth2 吗？'],
    ['Are you sure you would like to enable this DHCP server LAN ?', '确定启用 DHCP 服务 LAN 吗？'],
    ['Are you sure you want to delete ruleset WAN_IN ?', '确定删除规则集 WAN_IN 吗？'],
    ['Are you sure you want to delete this firewall rule #10 ?', '确定删除防火墙规则 # 10 吗？'],
    ['Are you sure you want to delete this static route for 192.0.2.0/24 ?', '确定删除目标为以下地址的静态路由 192.0.2.0/24 吗？'],
    ['Are you sure you would like to delete this user ubnt ?', '确定删除用户 ubnt 吗？'],
    ['Are you sure you want to delete category Work  Apps ?', '确定删除流量分类 Work  Apps 吗？'],
    ['Are you sure you want to DELETE wizard My_Wizard from the router?', '确定从路由器删除向导 My_Wizard 吗？'],
    ['WARNING: 24V PoE output on port eth4', '警告：端口 eth4 的 PoE 输出为 24V'],
    ['You have selected 24V for PoE output on port eth4. The device plugged into port eth4 MUST support 24V input voltage; otherwise it may be damaged.', '你已将端口 eth4 的 PoE 输出设置为 24V。接入端口 eth4 的设备必须支持 24V 输入电压，否则可能损坏。'],
    ['DHCP Server - LAN', 'DHCP 服务：LAN'],
    ['Configuration for queue type hfq_local', '队列类型配置：hfq_local'],
    ['Category Work Apps is in use.', '流量分类 Work Apps 正在使用中。'],
    ['Settings of 2 ONUs will be updated. This will cause a short down time of those ONUs. Are you sure you want to continue?', '将更新 2 台 ONU 的设置，期间这些设备会短暂离线。确定继续吗？']
  ];
  for(const [en,zh] of examples){message.textContent=en;await sleep(40);assert.equal(message.textContent,zh,en)}
  ok(true, '14 generated confirmation/title examples translate and preserve rule, user, interface, address and voltage parameters');
  pd.getElementById('chart-bytes').firstChild.data='1,024 bytes';await sleep(70);
  ok(pd.getElementById('chart-bytes').textContent==='1,024 字节' && pd.getElementById('other-bytes').textContent==='0 bytes', 'chart byte-unit refresh translates without modifying identical ordinary table data');
  pd.getElementById('edgeos-zh-toggle').click();
  ok(message.textContent===examples.at(-1)[0] && pd.getElementById('confirm-no').textContent==='No' && pd.getElementById('chart-bytes').textContent==='1,024 bytes', 'reused dynamic message restores its latest English text together with buttons and units');
  popup.window.close();
  const treeNode = (key, children = '', extra = '') => `<li class="${extra}"><span><span class="ui-icon"></span><span class="readonly">${key}</span></span>${children ? '<ul class="tree">'+children+'</ul>' : ''}</li>`;
  const tree = environment('<div id="ConfigTree"><div class="list"><ul class="tree">'+treeNode('firewall',treeNode('group',treeNode('address-group')+treeNode('ipv6-network-group'),'selected'))+'</ul></div><legend class="track">firewall / group : Firewall group</legend><form id="tree-form"><fieldset class="form">'+template('tree','ConfigTreeContentTextTemplate')+'</fieldset><input name="custom" value="firewall"><select name="mode"><option>system</option></select><pre class="cmds">set firewall group address-group firewall address 192.0.2.1</pre><button>Preview</button></form></div><div class="infotip">Firewall address-group</div>');
  const td=tree.document, tw=tree.window;
  const treeField=td.querySelector('label span.text');treeField.setAttribute('for','description');treeField.textContent='description';
  td.querySelector('input').name='description';td.querySelector('input').value='Work  Apps';
  const treeValues=JSON.stringify([...new tw.FormData(td.getElementById('tree-form')).entries()]);
  const originalCaptions=[...td.querySelectorAll('.readonly')].map(e=>e.innerHTML);
  let expanded='';const firstBranch=td.querySelector('.list li>span');firstBranch.firstElementChild.addEventListener('click',()=>{expanded=firstBranch.querySelector('span:nth-child(2)').innerHTML});
  tree.run();await sleep(70);
  ok(td.querySelector('.readonly').getAttribute('data-edgeos-zh-name')==='防火墙' && td.querySelector('li.selected > span > .readonly').getAttribute('aria-label')==='分组（group）', 'tree parameter captions add Chinese display attributes and accessibility labels');
  ok([...td.querySelectorAll('.readonly')].every((e,i)=>e.innerHTML===originalCaptions[i]), 'all tree node innerHTML values used by the factory expansion code remain byte-for-byte English');
  firstBranch.firstElementChild.click();
  ok(expanded==='firewall' && td.querySelector('legend.track').textContent==='firewall / group : Firewall group' && td.querySelector('legend.track').getAttribute('data-edgeos-zh-display')==='防火墙（firewall） / 分组（group）：防火墙分组', 'factory-style expansion callback receives original key; breadcrumb help translates solely through display metadata');
  ok(treeField.innerHTML==='description' && treeField.getAttribute('for')==='description' && treeField.getAttribute('aria-label')==='描述（description）' && JSON.stringify([...new tw.FormData(td.getElementById('tree-form')).entries()])===treeValues, 'representative field-label template gains bilingual display without changing label key, form names, values or implicit select value');
  ok(td.querySelector('.cmds').textContent==='set firewall group address-group firewall address 192.0.2.1' && td.querySelector('.infotip').textContent==='防火墙地址组', 'configuration commands stay original while an stock UI help string in a rendered tooltip translates');
  const newBranch=td.createElement('li');newBranch.innerHTML='<span><span class="ui-icon"></span><span class="readonly">cache-size</span></span>';td.querySelector('.list ul').append(newBranch);await sleep(70);
  ok(newBranch.querySelector('.readonly').getAttribute('aria-label')==='缓存大小（cache-size）', 'newly inserted configuration nodes gain captions asynchronously');
  newBranch.firstElementChild.classList.add('tag');await sleep(70);
  ok(newBranch.querySelector('.readonly').textContent==='cache-size' && !newBranch.querySelector('.readonly').hasAttribute('data-edgeos-zh-name') && !newBranch.querySelector('.readonly').hasAttribute('aria-label'), 'custom tag values matching a known parameter keep their original display, including after class-only changes');
  const groupLi=td.querySelector('li.selected');groupLi.classList.remove('selected');newBranch.classList.add('selected');newBranch.querySelector('.readonly').textContent='firewall';td.querySelector('legend.track').textContent='firewall : Firewall';await sleep(70);
  ok(td.querySelector('legend.track').getAttribute('data-edgeos-zh-display')==='firewall：防火墙设置' && newBranch.querySelector('.readonly').innerHTML==='firewall', 'custom named node remains untranslated in breadcrumb even when named firewall; only its help is translated');
  newBranch.firstElementChild.classList.remove('tag');newBranch.querySelector('.readonly').textContent='unknown-param';await sleep(70);
  ok(!newBranch.querySelector('.readonly').hasAttribute('data-edgeos-zh-name'), 'unknown parameter clears stale display metadata rather than reusing a previous Chinese caption');
  td.getElementById('edgeos-zh-toggle').click();
  ok(!td.querySelector('[data-edgeos-zh-name],[data-edgeos-zh-display]') && !td.querySelector('.readonly[aria-label]') && !td.documentElement.classList.contains('edgeos-zh-layout') && td.querySelector('.infotip').textContent==='Firewall address-group' && td.querySelector('legend.track').textContent==='firewall : Firewall', 'English mode restores original CSS, removes all generated tree captions and keeps latest original breadcrumb');
  td.getElementById('edgeos-zh-toggle').click();await sleep(70);
  ok(td.querySelector('.readonly').getAttribute('data-edgeos-zh-name')==='防火墙' && tree.counts().requests===0 && tree.counts().observerCalls<50, 'tree captions return in Chinese without requests or mutation-observer loops');
  tree.window.close();
  const labels=JSON.parse(fs.readFileSync('locales/tree-names.json','utf8'));
  const treeHelps=JSON.parse(fs.readFileSync('locales/tree-help.json','utf8'));
  const dhcp=environment('<div id="ConfigTree"><form id="dhcp-fields"><fieldset class="form"></fieldset></form></div>');
  const dhcpKeys=['disabled','global-parameters','hostfile-update','static-arp','use-dnsmasq'];
  for(const key of dhcpKeys){const label=dhcp.document.createElement('label'),span=dhcp.document.createElement('span'),input=dhcp.document.createElement('input');span.className='text';span.setAttribute('for',key);span.textContent=key;label.append(span);input.name=key;input.value=key==='disabled'?'false':key==='global-parameters'?'option custom-value;':'disable';input.setAttribute('data-infotip','Option to disable DHCP server');dhcp.document.querySelector('fieldset').append(label,input);}
  const originalDhcp=[...new dhcp.window.FormData(dhcp.document.getElementById('dhcp-fields')).entries()];
  dhcp.run();await sleep(70);
  ok(dhcp.document.querySelector('span[for="disabled"]').getAttribute('aria-label')==='禁用状态（disabled）' && dhcp.document.querySelector('span[for="global-parameters"]').getAttribute('aria-label')==='全局参数（global-parameters）' && dhcp.document.querySelector('span[for="static-arp"]').getAttribute('aria-label')==='静态 ARP（static-arp）', 'all three field headings missed on the live DHCP page now gain the intended bilingual labels');
  ok(JSON.stringify([...new dhcp.window.FormData(dhcp.document.getElementById('dhcp-fields')).entries()])===JSON.stringify(originalDhcp) && [...dhcp.document.querySelectorAll('input')].every(i=>i.getAttribute('data-infotip')==='Option to disable DHCP server'), 'DHCP false/disable values, extra configuration text and original hint metadata remain unchanged');
  dhcp.window.close();
  const helpCorpus=environment('<div class="tooltip"><div class="tooltip-content"><div class="infotip"></div></div></div>');
  const helpRoot=helpCorpus.document.querySelector('.infotip');
  const helpEntries=Object.entries(treeHelps);
  helpEntries.forEach(([en])=>{const p=helpCorpus.document.createElement('p');p.textContent=en;helpRoot.append(p)});
  helpCorpus.run();await sleep(70);
  ok([...helpRoot.children].every((p,i)=>p.textContent===helpEntries[i][1]), `all ${helpEntries.length} tree help strings translate in the factory tooltip/tooltip-content/infotip structure, including complete syntax and warnings`);
  helpCorpus.document.getElementById('edgeos-zh-toggle').click();
  ok([...helpRoot.children].every((p,i)=>p.textContent===helpEntries[i][0]), 'English mode restores every original tree help string without losing configuration syntax or warnings');
  helpCorpus.window.close();
  const vpn=environment('<div id="ConfigTree"><div class="list"><ul class="tree">'+treeNode('vpn',treeNode('pptp',treeNode('remote-access','','selected')))+ '</ul></div><legend class="track">vpn / pptp / remote-access : Remote access PPTP VPN</legend><form id="vpn-form"><fieldset class="form"><label><span class="text" for="client-ip-pool">client-ip-pool</span></label><input name="client-ip-pool" value="remote-access"><label><span class="text" for="outside-address">outside-address</span></label><input name="outside-address" value="192.0.2.1"></fieldset><pre class="cmds">set vpn pptp remote-access outside-address 192.0.2.1</pre></form></div><div class="infotip">Remote access PPTP VPN</div>');
  const vd=vpn.document, vpnValues=JSON.stringify([...new vpn.window.FormData(vd.getElementById('vpn-form')).entries()]);
  vpn.run();await sleep(70);
  ok(vd.querySelector('li.selected > span > .readonly').innerHTML==='remote-access' && vd.querySelector('li.selected > span > .readonly').getAttribute('aria-label')==='远程访问（remote-access）' && vd.querySelector('legend.track').getAttribute('data-edgeos-zh-display')==='VPN（vpn） / PPTP（pptp） / 远程访问（remote-access）：PPTP 远程访问 VPN', 'the screenshot VPN/PPTP/remote-access omission gains its bilingual caption and full Chinese breadcrumb while its raw path stays unchanged');
  ok(vd.querySelector('.infotip').textContent==='PPTP 远程访问 VPN' && JSON.stringify([...new vpn.window.FormData(vd.getElementById('vpn-form')).entries()])===vpnValues && vd.querySelector('.cmds').textContent==='set vpn pptp remote-access outside-address 192.0.2.1', 'VPN tooltip translates without changing addresses, literal user values or the set command');
  vpn.window.close();
  const captionCorpus=environment('<div id="ConfigTree"><div class="list"><ul class="tree"></ul></div><form id="all-fields"><fieldset class="form"></fieldset></form></div>');
  const cd=captionCorpus.document, labelEntries=Object.entries(labels);
  cd.querySelector('ul.tree').innerHTML=labelEntries.map(([key])=>treeNode(key)).join('');
  labelEntries.forEach(([key])=>{const label=cd.createElement('label'),span=cd.createElement('span'),input=cd.createElement('input');span.className='text';span.setAttribute('for',key);span.textContent=key;label.append(span);input.name=key;input.value=key;cd.querySelector('fieldset').append(label,input);});
  const corpusValues=JSON.stringify([...new captionCorpus.window.FormData(cd.getElementById('all-fields')).entries()]);
  captionCorpus.run();await sleep(100);
  ok([...cd.querySelectorAll('.readonly')].every((e,i)=>e.innerHTML===labelEntries[i][0]&&e.getAttribute('aria-label')===`${labelEntries[i][1]}（${labelEntries[i][0]}）`) && [...cd.querySelectorAll('label span.text')].every((e,i)=>e.innerHTML===labelEntries[i][0]&&e.getAttribute('aria-label')===`${labelEntries[i][1]}（${labelEntries[i][0]}）`) && JSON.stringify([...new captionCorpus.window.FormData(cd.getElementById('all-fields')).entries()])===corpusValues, `all ${labelEntries.length} names render as bilingual factory nodes and field headings while preserving raw keys and submitted values`);
  cd.getElementById('edgeos-zh-toggle').click();
  ok(!cd.querySelector('[data-edgeos-zh-name],[data-edgeos-zh-display]') && !cd.querySelector('.readonly[aria-label],label span.text[aria-label]') && JSON.stringify([...new captionCorpus.window.FormData(cd.getElementById('all-fields')).entries()])===corpusValues, 'English restores the complete name corpus and leaves form values unchanged');
  captionCorpus.window.close();
  console.log(`\n${passed} checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
