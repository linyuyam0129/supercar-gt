// 世界觀與劇情對話（全部為原創角色與設定）
import { Profile } from './store.js';
import { TRACKS, CARS } from './data.js';

export const WORLD = {
  city: '曙光灣',
  league: '曙光灣極速聯賽',
  paddock: '聯賽園區',
};

// NPC 外觀與站位（hub 會依此生成角色）
export const NPCS = {
  rin: { name: '小鈴', title: '專屬技師', look: { suit: 0x2f6fd6, suit2: 0xffd24d, hair: 0xc2532f, hairStyle: 'pony', skin: 0xf3cfb0, height: 0.93, cap: 0x1b2a44 }, color: '#5aa2ff' },
  zhou: { name: '老周', title: '賽事總監', look: { suit: 0x2b2f36, suit2: 0xe0e0e0, hair: 0x9a9a9a, hairStyle: 'short', skin: 0xe2b48f, height: 1.02 }, color: '#ffd24d' },
  kai: { name: '凱', title: '衛冕冠軍「黑豹」', look: { suit: 0x141414, suit2: 0xd4a017, hair: 0x101010, hairStyle: 'spiky', skin: 0xd9a77f, height: 1.06 }, color: '#ff5a4a' },
  aoi: { name: '小葵', title: '新人同期', look: { suit: 0x1f9a5a, suit2: 0xffffff, hair: 0x3a2618, hairStyle: 'long', skin: 0xf6d2b8, height: 0.95 }, color: '#4dde8a' },
};

const N = (id) => NPCS[id].name;
const L = (who, text) => ({ who, text });

export const INTRO = [
  L('旁白', `${WORLD.city}——白天是繁忙的港口城市，入夜後，環繞城市的山道、海岸與沙漠公路就成了賽道。`),
  L('旁白', `「${WORLD.league}」集結了各地最快的車手。今天，你拿到了新人參賽證。`),
  L('rin', '你就是新來的車手吧？我是小鈴，從今天起當你的專屬技師！你的車停在 1 號車庫。'),
  L('rin', '想換車、換烤漆就來車庫找我。要報名比賽，去東邊的報名處找老周。'),
  L('rin', '聽說衛冕冠軍「黑豹」凱也在園區……不過他只跟「困難」等級的對手比。先累積幾場勝利吧！'),
];

function wins() { return TRACKS.filter((t) => Profile.winLevel(t.id) >= 1).length; }
function hardWins() { return TRACKS.filter((t) => Profile.winLevel(t.id) >= 3).length; }

/** 回傳 { lines, actions: [{ label, act }] }；act: 'garage' | 'tracks' | 'shop' | null */
export function talkTo(id) {
  const w = wins(), hw = hardWins(), all = TRACKS.length;
  const owned = CARS.filter((c) => Profile.owns(c.id)).length;
  switch (id) {
    case 'rin': {
      const lines = [];
      if (w === 0) lines.push(L('rin', '第一場比賽建議選「綠野國際賽道」，難度先選「簡單」，熟悉一下對手的跑法。'));
      else if (w < all) lines.push(L('rin', `已經拿下 ${w} 條賽道的勝利了！贏來的金幣可以拿去買更快的車。`));
      else lines.push(L('rin', '六條賽道全勝！你的名字已經傳遍整個曙光灣了。'));
      if (owned >= 5) lines.push(L('rin', `車庫裡已經有 ${owned} 台車了……我每天光是打蠟就忙不完啦！`));
      else lines.push(L('rin', '山路要選抓地力好、車身輕的車；沙漠直線多，就選極速高的。'));
      return { lines, actions: [{ label: '進入車庫', act: 'garage' }, { label: '下次再說', act: null }] };
    }
    case 'zhou': {
      const lines = [L('zhou', '來報名嗎？可以自己選對手人數和難易度——難度越高、名次越好，金幣就越多。')];
      if (w === 0) lines.push(L('zhou', '新人第一戰就拿冠軍的可不多見。讓我看看你的本事。'));
      else lines.push(L('zhou', `目前戰績：${w} / ${all} 條賽道獲勝，其中 ${hw} 條是在「困難」拿下的。`));
      return { lines, actions: [{ label: '報名比賽', act: 'tracks' }, { label: '先逛逛', act: null }] };
    }
    case 'kai': {
      let text;
      if (hw === 0) text = '新人？等你在「困難」贏過一場，再來跟我說話。';
      else if (hw < 3) text = `${hw} 場？有點本事。不過真正的戰場是山路——霧嶺山道和雪峰隘口，我在那裡等你。`;
      else if (hw < all) text = '……你的走線越來越像樣了。下一場，我不會再放水。';
      else text = '全部六條賽道都在「困難」贏了我？……下一季的冠軍，是你的了。';
      return { lines: [L('kai', text)], actions: [{ label: hw === 0 ? '走著瞧' : '來比一場', act: hw === 0 ? null : 'tracks' }] };
    }
    case 'aoi': {
      const tips = [
        '雪峰隘口的髮夾彎要提早煞車，出彎再補油，比硬衝快多了！',
        '夕陽海岸線的長彎幾乎可以全油門，但小心最後的 S 彎。',
        '沙漠極速環道的直線很長，記得最後一刻再煞車！',
        '霧嶺山道是夜間賽，看路邊的反光片和箭頭牌判斷彎道方向。',
        '覺得車子太難控制，可以在設定裡把「操控輔助」調高喔。',
      ];
      const tip = tips[Math.floor(Math.random() * tips.length)];
      const lines = [L('aoi', w > 0 ? `我們同一期出道，你已經贏 ${w} 場了！我也要加油才行。` : '嗨！我也是今年的新人，一起加油吧！'), L('aoi', tip)];
      return { lines, actions: [{ label: '謝啦', act: null }] };
    }
  }
  return { lines: [], actions: [] };
}

export const speakerName = (who) => (NPCS[who] ? NPCS[who].name : who);
export const speakerColor = (who) => (NPCS[who] ? NPCS[who].color : '#cfd6e4');
export const winStats = () => ({ wins: wins(), hard: hardWins(), total: TRACKS.length });
