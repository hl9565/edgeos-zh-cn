(() => {
  'use strict';
  if (location.hostname !== '192.168.1.1') return;
  if (!/^https?:$/.test(location.protocol)) return;
  if (/^\/(?:cli|api|ws)(?:\/|$)/i.test(location.pathname)) return;
  if (!/^EdgeOS(?:\s|$)/i.test(document.title)) return;
  if (document.getElementById('edgeos-zh-toggle')) return;

  const TERMS = __DICTIONARY__;
  const TREE_LABELS = __TREE_LABELS__;
  const TREE_HELP = __TREE_HELP__;
  const treeHelpLookup = new Map(Object.entries(TREE_HELP).map(([en, zh]) => [en.trim().replace(/\s+/g, ' ').toLowerCase(), zh]));
  const lookup = new Map(Object.entries(TERMS).map(([en, zh]) => [en.toLowerCase(), zh]));
  const attributes = ['title', 'placeholder', 'aria-label', 'alt'];
  const watchedAttributes = [...attributes, 'data-tooltip', 'data-infotip', 'class'];
  const blocked = 'script,style,noscript,template,input,textarea,pre,code,kbd,samp,iframe,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.terminal,.xterm,.ace_editor,.CodeMirror,.cmds,.full-name,.hostname,.host-name,.interface-port,.host,.notation,#edgeos-zh-toggle,#edgeos-zh-style';
  const textChanges = new Map();
  const attrChanges = new Map();
  const roots = new Set();
  const emptyMessages = new Set(['no data available in table', 'no matching records found', 'no categories found.', 'no users found.', 'no interfaces found.', 'no rules found.', 'no groups found.', 'no routes found.', 'no leases found.', 'no entries found.']);
  for (const term of Object.keys(TERMS)) {
    if (/^No (?:DHCP servers configured|ONU available|alerts|areas available|filters available|groups available|interfaces available|interfaces configured for OSPF|leases assigned|mappings available|queue type found|results available|routes available|rules available|rulesets available|stats available|users available)\.$/i.test(term)) emptyMessages.add(term.toLowerCase());
  }
  let enabled = true;
  let frame = 0;

  function translateDynamicMessage(value) {
    if (!/^(?:Are you sure you |Category |WARNING: |You have selected |Settings of |Configuration |Create queue type |Add (?:Branch|Leaf) Node for |Filters attached to |Devices Connected to ONU |WiFi Clients Connected to ONU |DHCP Server - |Upload new )/.test(value)) return null;
    let match = value.match(/^Are you sure you (?:want|would like) to (enable|disable) (?:this DHCP server|interface) (.+?)\s*\?$/i);
    if (match) return `确定${match[1].toLowerCase() === 'enable' ? '启用' : '禁用'}${/DHCP server/i.test(value) ? ' DHCP 服务' : '接口'} ${match[2]} 吗？`;
    match = value.match(/^Are you sure you (?:want|would like) to delete (this static route for|ruleset|this firewall rule #|this DHCP server|this mapping|this user|category|queue type|this filter|profile|vlan|pppoe|bridge|bond)\s*(.+?)\s*\?$/i);
    if (match) {
      const kinds = {'this static route for':'目标为以下地址的静态路由','ruleset':'规则集','this firewall rule #':'防火墙规则 #','this DHCP server':'DHCP 服务','this mapping':'静态映射','this user':'用户','category':'流量分类','queue type':'队列类型','this filter':'过滤器','profile':'配置档案','vlan':'VLAN','pppoe':'PPPoE','bridge':'桥接接口','bond':'聚合接口'};
      return `确定删除${kinds[match[1].toLowerCase()]} ${match[2]} 吗？`;
    }
    match = value.match(/^Are you sure you want to DELETE wizard (.+) from the router\?$/);
    if (match) return `确定从路由器删除向导 ${match[1]} 吗？`;
    match = value.match(/^Category (.+) is in use\.$/);
    if (match) return `流量分类 ${match[1]} 正在使用中。`;
    match = value.match(/^WARNING: (.+) PoE output on port (.+)$/);
    if (match) return `警告：端口 ${match[2]} 的 PoE 输出为 ${match[1]}`;
    match = value.match(/^You have selected (.+) for PoE output on port (.+)\. The device plugged into port (.+) MUST support (.+) input voltage; otherwise it may be damaged\.$/);
    if (match) return `你已将端口 ${match[2]} 的 PoE 输出设置为 ${match[1]}。接入端口 ${match[3]} 的设备必须支持 ${match[4]} 输入电压，否则可能损坏。`;
    match = value.match(/^Settings of (\d+) ONUs? will be updated\. This will cause a short down time of those ONUs\. Are you sure you want to continue\?$/);
    if (match) return `将更新 ${match[1]} 台 ONU 的设置，期间这些设备会短暂离线。确定继续吗？`;
    match = value.match(/^Are you sure you want to restart ONU (.+)\?$/);
    if (match) return `确定重启 ONU ${match[1]} 吗？`;
    match = value.match(/^Are you sure you want to reset ONU (.+) to default\?$/);
    if (match) return `确定将 ONU ${match[1]} 恢复为默认设置吗？`;
    match = value.match(/^Are you sure you want to delete configuration for ONU with S\/N (.+)\?$/);
    if (match) return `确定删除序列号为 ${match[1]} 的 ONU 配置吗？`;
    match = value.match(/^(Configuration for queue type|Create queue type|Add Branch Node for|Add Leaf Node for|Filters attached to|Configuration of ONU Profile|Configuration of ONU|Devices Connected to ONU|WiFi Clients Connected to ONU|DHCP Server -|Upload new) (.+)$/);
    if (match) {
      const titles = {'Configuration for queue type':'队列类型配置','Create queue type':'创建队列类型','Add Branch Node for':'添加分支节点','Add Leaf Node for':'添加叶节点','Filters attached to':'关联的过滤器','Configuration of ONU Profile':'ONU 配置档案','Configuration of ONU':'ONU 配置','Devices Connected to ONU':'ONU 连接的设备','WiFi Clients Connected to ONU':'ONU 连接的 Wi-Fi 客户端','DHCP Server -':'DHCP 服务','Upload new':'上传新的'};
      return `${titles[match[1]]}：${match[2]}`;
    }
    match = value.match(/^Configuration for (.+)$/);
    if (match) return `配置：${match[1]}`;
    return null;
  }

  function translate(value, fragments = false) {
    if (!value || value.length > 400) return value;
    const normalized = value.trim().replace(/\s+/g, ' ');
    let zh = lookup.get(normalized.toLowerCase());
    if (!zh) zh = translateDynamicMessage(value.trim());
    if (!zh) {
      let match = normalized.match(/^(Tx|Rx) Rate \((Kbps|Mbps|Gbps|bps)\)$/);
      if (match) zh = (match[1] === 'Tx' ? '发送' : '接收') + '速率（' + match[2] + '）';
      match = normalized.match(/^Showing ([\d,]+) to ([\d,]+) of ([\d,]+) entries$/);
      if (match) zh = `显示第 ${match[1]} 至 ${match[2]} 条，共 ${match[3]} 条`;
      match = normalized.match(/^Show (\d+) entries$/);
      if (match) zh = `每页显示 ${match[1]} 条`;
      match = normalized.match(/^([\d,]+) entries$/);
      if (match) zh = `${match[1]} 条`;
      match = normalized.match(/^Interface Configuration for ([A-Za-z0-9_.:-]+)$/);
      if (match) zh = `接口配置：${match[1]}`;
      match = normalized.match(/^(Rule|Ruleset) Configuration for (.+)$/);
      if (match) zh = `${match[1] === 'Rule' ? '规则' : '规则集'}配置：${match[2]}`;
      match = normalized.match(/^Example:\s+(.+)$/i);
      if (match) zh = `示例：${match[1]}`;
      match = normalized.match(/^Connect (eth\d+(?:\/SFP)?)$/);
      if (match) zh = `将 ${match[1]}`;
      const durations = /^(?:\d+\s+(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))(?:,?\s+\d+\s+(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))*$/i;
      if (durations.test(normalized)) {
        const units = {year:'年',month:'个月',week:'周',day:'天',hour:'小时',minute:'分钟',second:'秒'};
        zh = normalized.replace(/(\d+)\s+(year|month|week|day|hour|minute|second)s?/gi, (_, number, unit) => number + units[unit.toLowerCase()]).replace(/,\s*/g,' ');
      }
      match = normalized.match(/^(.+?): activate to sort column (ascending|descending)$/);
      if (match) {
        const heading = lookup.get(match[1].toLowerCase()) || (/^(PoE|MTU|DNS|NAT|OSPF|RIP|BGP|VLAN|VPN|SSID)$/i.test(match[1]) ? match[1] : null);
        if (heading) zh = `${heading}：点击按${match[2] === 'ascending' ? '升序' : '降序'}排序`;
      }
    }
    // DataTables divides this sentence across text nodes and numeric spans.
    if (!fragments && ['showing', 'to', 'of', 'entries'].includes(normalized.toLowerCase())) return value;
    if (!zh || zh === normalized) return value;
    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    return leading + zh + trailing;
  }

  // These columns contain fixed UI enums, not arbitrary device data. Scope
  // every exception to its actual EdgeOS view and leave identifiers untouched.
  function contextualText(element, value) {
    if (!element) return null;
    const word = value.trim().toLowerCase();
    if (element.matches('#TrafficAnalysisUserGraph .notation > span.host') && word === 'no data available') return '暂无数据';
    if (element.closest('#RoutingStaticRouteFilters a[href$="/connected"]') && word === 'connected') return '直连';
    if (element.closest('#Wizard') && word === 'and') return '和';
    const cell = element.closest('td');
    if (!cell) return null;
    if (cell.matches('#TrafficAnalysisUserGraph .summary td')) {
      const bytes = value.trim().match(/^([\d,.]+) bytes?$/i);
      if (bytes) return `${bytes[1]} 字节`;
    }
    if (cell.matches('#RoutingStatic td.selected,#RoutingStatic td.fib') && /^(yes|no)$/.test(word)) return word === 'yes' ? '是' : '否';
    if (cell.matches('#RoutingStatic td.type')) return ({connected:'直连',kernel:'内核路由',static:'静态路由'})[word] || null;
    if (cell.matches('#SecurityFirewallPolicies td.default')) return ({drop:'丢弃',reject:'拒绝',accept:'接受'})[word] || null;
    if (cell.matches('#UsersLocal td.level')) return ({admin:'管理员',operator:'操作员'})[word] || null;
    if (cell.matches('#UsersLocal td.status')) return ({active:'活跃',inactive:'未活跃'})[word] || null;
    if (cell.matches('#UsersLocal td.uptime')) {
      const time = value.trim().match(/^(\d+)h (\d+)m (\d+)s$/);
      if (time) return `${time[1]}小时 ${time[2]}分钟 ${time[3]}秒`;
    }
    if (cell.matches('#UsersLocal td.date')) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const date = value.trim().match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
      const month = date ? months.indexOf(date[1]) + 1 : 0;
      if (month) return `${date[3]}年${month}月${date[2]}日`;
    }
    return null;
  }

  function treeName(key, path = '') {
    const overrides = {'firewall/name':'IPv4 防火墙规则集', 'firewall/ipv6-name':'IPv6 防火墙规则集'};
    return overrides[path] || TREE_LABELS[key] || null;
  }

  function treePath(li) {
    const path = [];
    while (li && li.matches('#ConfigTree .list li')) {
      const branch = Array.from(li.children).find(child => child.matches('span'));
      const caption = branch && Array.from(branch.children).find(child => child.matches('.readonly'));
      if (!caption) return [];
      path.unshift({key:caption.textContent.trim(), parameter:!branch.classList.contains('tag')});
      li = li.parentElement?.closest('li');
    }
    return path;
  }

  function treeHelp(value) {
    return treeHelpLookup.get(value.trim().replace(/\s+/g, ' ').toLowerCase()) || translate(value);
  }

  // The original UI reads .readonly.innerHTML when expanding nodes. Add
  // captions through CSS attributes only; never change those text nodes or
  // insert child markup into them. Custom tag values are not parameters.
  function treeAttribute(element, name, after) {
    let changes = attrChanges.get(element);
    const previous = changes?.get(name);
    if (after === null) {
      if (previous && element.getAttribute(name) === previous.after) {
        if (previous.before === null) element.removeAttribute(name);
        else element.setAttribute(name, previous.before);
      }
      changes?.delete(name);
      if (changes && !changes.size) attrChanges.delete(element);
      return;
    }
    if (element.getAttribute(name) === after) return;
    if (!changes) attrChanges.set(element, changes = new Map());
    changes.set(name, {before:previous ? previous.before : element.getAttribute(name), after});
    element.setAttribute(name, after);
  }

  function scanTreeCaption(element) {
    if (!element?.closest('#ConfigTree')) return;
    let name = null, display = null;
    if (element.matches('#ConfigTree .list li > span > .readonly')) {
      const path = treePath(element.parentElement.parentElement);
      if (path.length && path[path.length - 1].parameter) name = treeName(path[path.length - 1].key, path.map(part => part.key).join('/'));
      display = name ? `${name}（${element.textContent.trim()}）` : null;
      treeAttribute(element, 'data-edgeos-zh-name', name);
    } else if (element.matches('#ConfigTree fieldset.form label > span.text[for]')) {
      // A label's for attribute is a fixed parameter key; form values remain data.
      const key = element.getAttribute('for');
      if (element.textContent.trim() === key) name = treeName(key);
      display = name ? `${name}（${key}）` : null;
      treeAttribute(element, 'data-edgeos-zh-name', name);
    } else if (element.matches('#ConfigTree legend.track')) {
      const raw = element.textContent.trim();
      if (raw === 'root') display = '根节点（root）';
      else {
        const selected = element.closest('#ConfigTree').querySelector('.list li.selected');
        const path = selected ? treePath(selected) : [];
        const rawPath = path.map(part => part.key).join(' / ');
        if (path.length && (raw === rawPath || raw.startsWith(rawPath + ' : '))) {
          const help = raw === rawPath ? '' : raw.slice(rawPath.length + 3);
          display = path.map((part, index) => {
            const zh = part.parameter ? treeName(part.key, path.slice(0,index+1).map(p=>p.key).join('/')) : null;
            return zh ? `${zh}（${part.key}）` : part.key;
          }).join(' / ') + (help ? '：' + treeHelp(help) : '');
        }
      }
      treeAttribute(element, 'data-edgeos-zh-display', display);
    } else return;
    treeAttribute(element, 'aria-label', display);
  }

  function isProtected(element) {
    if (!element || element.closest(blocked)) return true;
    // Never change an option's implicit submitted value. Explicit values are kept.
    const option = element.closest('option');
    if (option && !option.hasAttribute('value')) return true;
    if (element.closest('#ConfigTree') && !element.closest('button,.section-title,.ui-dialog-title')) return true;
    const svg = element.closest('svg');
    if (svg && !element.matches('text') && !element.closest('text')) return true;
    const cell = element.closest('td');
    if (cell && !cell.matches('.status,.buttons,.actions') && !element.closest('button')) {
      // Only known DataTables empty-state cells are UI; ordinary cells stay data.
      if (!cell.matches('.dataTables_empty') || !emptyMessages.has(cell.textContent.trim().toLowerCase())) return true;
    }
    const dd = element.closest('dd');
    if (dd && !dd.matches('.bool,.status,.uptime')) return true;
    return false;
  }

  function scanText(node) {
    const parent = node.parentElement;
    scanTreeCaption(parent);
    const contextual = parent && !parent.closest('script,style,template,[contenteditable],pre,code') ? contextualText(parent, node.data) : null;
    if (contextual) {
      const after = node.data.match(/^\s*/)[0] + contextual + node.data.match(/\s*$/)[0];
      textChanges.set(node, { before: node.data, after });
      node.data = after;
      return;
    }
    if (!parent || isProtected(parent)) return;
    if (parent.closest('svg') && !/^(Tx|Rx) Rate \(/.test(node.data.trim())) return;
    if (parent.closest('td.status,dd.status,dd.bool') && !/^(connected|disconnected|enabled|disabled|enable|disable|up|down)$/i.test(node.data.trim())) return;
    let after = translate(node.data, Boolean(parent.closest('.dataTables_info,.dataTables_length')));
    if (parent.closest('.infotip')) after = treeHelp(node.data);
    if (parent.closest('.service.routing dt') && /^connected$/i.test(node.data.trim())) after = node.data.replace(/connected/i,'直连');
    if (after === node.data) return;
    textChanges.set(node, { before: node.data, after });
    node.data = after; // Keeps the original node, listeners, markup and numeric spans.
  }

  function scanAttributes(element) {
    scanTreeCaption(element);
    // Input placeholders are display hints, never input values.
    const isInput = element.matches('input:not([type="hidden"]),textarea');
    if (!isInput && isProtected(element)) return;
    if (isInput && element.closest('[contenteditable],#ConfigTree,.terminal,.xterm')) return;
    for (const name of attributes) {
      if (!element.hasAttribute(name)) continue;
      if (isInput && name !== 'placeholder' && name !== 'title' && name !== 'aria-label') continue;
      const before = element.getAttribute(name);
      const after = translate(before);
      if (before === after) continue;
      let changes = attrChanges.get(element);
      if (!changes) attrChanges.set(element, changes = new Map());
      changes.set(name, { before, after });
      element.setAttribute(name, after);
    }
    // Preserve the application's tooltip metadata and jQuery data cache.
    // Translate rendered tooltips normally, and add a native navigation hint.
    const hint = element.getAttribute('data-tooltip') || element.getAttribute('data-infotip');
    const generated = attrChanges.get(element)?.get('title');
    if (hint && (!element.hasAttribute('title') || (generated?.generated && element.title === generated.after))) {
      // Infotips contain line breaks and formatting tags. Use plain text for the
      // native hint, leaving the application's HTML metadata/cache untouched.
      const lines = hint.split(/<br\s*\/?\s*>|<\/br>/i).map(line => line.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
      const translated = lines.map(line => translate(line));
      const after = translated.some((line, i) => line !== lines[i]) ? translated.join('\n') : hint;
      if (after !== hint && element.getAttribute('title') !== after) {
        let changes = attrChanges.get(element);
        if (!changes) attrChanges.set(element, changes = new Map());
        changes.set('title', { before: generated?.generated ? generated.before : element.getAttribute('title'), after, generated: true });
        element.setAttribute('title', after);
      }
    }
  }

  function scan(root) {
    if (!root.isConnected) return;
    if (root.nodeType === Node.TEXT_NODE) { scanText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    scanAttributes(root);
    // Never walk script templates, input data, terminal or other protected subtrees.
    if (root.matches(blocked)) {
      // The chart uses the same host span for its empty-state caption and host
      // names. Only inspect that known caption; keep all other host data blocked.
      scanChartEmpty(root);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(blocked)) {
          scanAttributes(node);
          scanChartEmpty(node);
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) scanText(node);
      else scanAttributes(node);
    }
  }

  function scanChartEmpty(root) {
    if (root.closest('script,style,template,[contenteditable],pre,code')) return;
    const selector = '#TrafficAnalysisUserGraph .notation > span.host';
    const captions = root.matches(selector) ? [root] : root.querySelectorAll(selector);
    for (const caption of captions) {
      if (caption.childNodes.length === 1 && caption.firstChild.nodeType === Node.TEXT_NODE) scanText(caption.firstChild);
    }
  }

  function prune() {
    for (const node of textChanges.keys()) if (!node.isConnected) textChanges.delete(node);
    for (const node of attrChanges.keys()) if (!node.isConnected) attrChanges.delete(node);
  }

  function flush() {
    frame = 0;
    if (!enabled) { roots.clear(); return; }
    const pending = Array.from(roots);
    roots.clear();
    for (const node of pending) {
      if (!pending.some(other => other !== node && other.nodeType === Node.ELEMENT_NODE && other.contains(node))) scan(node);
    }
    prune();
  }

  function schedule(root) {
    if (!enabled || !root || !root.isConnected) return;
    roots.add(root);
    if (roots.size > 100) { roots.clear(); roots.add(document.body); }
    if (!frame) frame = requestAnimationFrame(flush);
  }

  const observer = new MutationObserver(records => {
    if (!enabled) return;
    for (const record of records) {
      if (record.type === 'characterData') {
        const change = textChanges.get(record.target);
        if (change && record.target.data === change.after) continue;
        if (record.target.parentElement?.matches('#ConfigTree .readonly,#ConfigTree span.text[for],#ConfigTree legend.track')) { schedule(record.target); continue; }
        // Ignore frequent rate/counter changes without traversing their parents.
        const contextual = contextualText(record.target.parentElement, record.target.data);
        if ((contextual || /\b[A-Za-z]{2,}\b/.test(record.target.data)) && record.target.data.length <= 400) {
          if (contextual || translate(record.target.data, Boolean(record.target.parentElement?.closest('.dataTables_info,.dataTables_length'))) !== record.target.data) schedule(record.target);
        }
      } else if (record.type === 'attributes') {
        if (record.attributeName === 'class') {
          if (record.target.closest('#ConfigTree')) schedule(record.target);
          continue;
        }
        const change = attrChanges.get(record.target)?.get(record.attributeName);
        if (!change || record.target.getAttribute(record.attributeName) !== change.after) schedule(record.target);
      } else {
        for (const node of record.addedNodes) schedule(node);
        if (record.removedNodes.length) prune();
      }
    }
  });

  const style = document.createElement('style');
  style.id = 'edgeos-zh-style';
  style.textContent = '#edgeos-zh-toggle{position:fixed;right:16px;bottom:42px;z-index:2147483000;border:1px solid #b8c9e4;border-radius:20px;padding:7px 12px;background:#fff;color:#005ac2;font:13px/1.4 system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px #0002}#edgeos-zh-toggle:focus-visible{outline:2px solid #06f;outline-offset:2px}';
  // EdgeOS 3 combines .button's outer padding with jQuery UI's label
  // padding. CJK can wrap inside that squeezed flex item; English cannot.
  // Keep icon buttons' original spacing and restore factory CSS in English.
  style.textContent += 'html.edgeos-zh-layout button,html.edgeos-zh-layout .ui-button-text{white-space:nowrap}html.edgeos-zh-layout button.button.ui-button-text-only .ui-button-text{padding-left:0;padding-right:0;flex-shrink:0}';
  style.textContent += 'html.edgeos-zh-layout #ConfigTree [data-edgeos-zh-name]::before{content:attr(data-edgeos-zh-name) "（"}html.edgeos-zh-layout #ConfigTree [data-edgeos-zh-name]::after{content:"）"}html.edgeos-zh-layout #ConfigTree .list li>span{white-space:normal;display:block}html.edgeos-zh-layout #ConfigTree .list .readonly[data-edgeos-zh-name]{max-width:calc(100% - 44px);vertical-align:top;overflow-wrap:anywhere;font-size:12px;line-height:20px}html.edgeos-zh-layout #ConfigTree .list .readonly[data-edgeos-zh-name]::before{font-size:14px}html.edgeos-zh-layout #ConfigTree legend.track[data-edgeos-zh-display]{font-size:0}html.edgeos-zh-layout #ConfigTree legend.track[data-edgeos-zh-display]::before{content:attr(data-edgeos-zh-display);font-size:12px}';
  document.head.appendChild(style);
  document.documentElement.classList.add('edgeos-zh-layout');
  const toggle = document.createElement('button');
  toggle.id = 'edgeos-zh-toggle';
  toggle.type = 'button';
  toggle.textContent = '中文 · 切换 English';
  toggle.title = '仅切换当前浏览器显示语言，不改变路由器配置';
  toggle.setAttribute('aria-pressed', 'true');
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    document.documentElement.classList.toggle('edgeos-zh-layout', enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? '中文 · 切换 English' : 'English · 切换中文';
    if (enabled) {
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: watchedAttributes });
      schedule(document.body);
    } else {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      roots.clear();
      for (const [node, change] of textChanges) if (node.isConnected && node.data === change.after) node.data = change.before;
      for (const [element, changes] of attrChanges) {
        if (!element.isConnected) continue;
        for (const [name, change] of changes) {
          if (element.getAttribute(name) !== change.after) continue;
          if (change.before === null) element.removeAttribute(name);
          else element.setAttribute(name, change.before);
        }
      }
      textChanges.clear();
      attrChanges.clear();
    }
  });
  document.body.appendChild(toggle);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: watchedAttributes });
  scan(document.body);
})();
