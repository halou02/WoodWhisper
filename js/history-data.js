/* 历史页五朝代数据。仅维护内容，不放页面交互逻辑。 */

    const DYNASTIES = [
      {
        key: 'tang',
        name: '唐',
        year: '618—907',
        texts: [
          '唐代中原人口南迁，木构建筑与雕刻技艺传入潮州，早期木雕参与寺庙、梁注、斗拱和莲花卷草线样相关。',
          '受佛教文化与中原工艺影响，早期作品以浮雕为主，题材多为莲花、卷草等纹样，风格古朴浑厚。',
          '为后世潮州木雕的兴盛奠定了根基，开启了千年刀木传承的序章。'
        ],
        images: [
          'assets/images/history/历史页UI元素参考/1.jpeg',
          'assets/images/history/历史页UI元素参考/8.JPG',
          'assets/images/history/历史页UI元素参考/12.JPG',
          'assets/images/history/历史页UI元素参考/6.JPG'
        ],
        trivia: '唐代潮州开元寺始建于738年，寺内现存部分木构构件被认为是潮州木雕最早的实物遗存之一。',
        particle: '蓮'
      },
      {
        key: 'song',
        name: '宋',
        year: '960—1279',
        texts: [
          '宋代潮州经济繁荣，海外贸易兴盛，木雕技法渐趋成熟，广泛应用于祠堂庙宇建筑装饰与神龛屏风制作。',
          '镂雕、圆雕、浮雕并用，题材扩展到人物花鸟、戏曲故事，线条流畅层次丰富。',
          '开元寺韩文公祠等建筑的木雕装饰，见证了这一时期工艺的显著精进。'
        ],
        images: [
          'assets/images/history/历史页UI元素参考/2.JPG',
          'assets/images/history/历史页UI元素参考/3.JPG',
          'assets/images/history/历史页UI元素参考/4.JPG',
          'assets/images/history/历史页UI元素参考/5.JPG'
        ],
        trivia: '宋代潮州港是海上丝绸之路重要港口，木雕随商船远销东南亚，成为最早出海的潮州工艺之一。',
        particle: '雲'
      },
      {
        key: 'ming',
        name: '明',
        year: '1368—1644',
        texts: [
          '明代潮州商贸发达宗族文化兴盛，祠堂家庙广建木雕需求大增，镂空多层技法趋于成熟。',
          '金漆木雕成为特色——以生漆贴金箔金碧辉煌，题材多取材三国水浒等戏曲小说。',
          '构图繁复层层叠叠远近皆可观赏，潮州金漆木雕作为独立流派正式确立。'
        ],
        images: [
          'assets/images/history/历史页UI元素参考/7.JPG',
          'assets/images/history/历史页UI元素参考/9.JPG',
          'assets/images/history/历史页UI元素参考/10.JPG',
          'assets/images/history/历史页UI元素参考/11.JPG'
        ],
        trivia: '明代潮州匠人已掌握"多层通雕"绝技，一块木板可镂刻多达五层，每层图案独立且相互呼应。',
        particle: '金'
      },
      {
        key: 'qing',
        name: '清',
        year: '1644—1912',
        texts: [
          '清代潮州木雕工艺登峰造极，蟹篓镂空技法成为绝活，以整段木头雕出竹交织的蟹篓与篓中横行的螃蟹。',
          '纤毫毕现栩栩如生，"潮州金漆木雕"与浙江东阳木雕并称中国两大木雕体系。',
          '作品远销东南亚成为华侨乡愁的寄托与身份的象征，闻名海内外。'
        ],
        images: [
          'assets/images/history/历史页UI元素参考/13.jpg',
          'assets/images/history/历史页UI元素参考/14.jpg',
          'assets/images/history/历史页UI元素参考/15.jpg',
          'assets/images/history/历史页UI元素参考/16.jpg'
        ],
        trivia: '清代潮州木雕匠人陈氏家族独创"蟹篓"技法，一件作品需耗时数月，竹篾细如发丝却不断裂。',
        particle: '蟹'
      },
      {
        key: 'modern',
        name: '近现代',
        year: '1912—至今',
        texts: [
          '2006年潮州木雕入选首批国家级非物质文化遗产名录，涌现出张鉴轩陈培臣等国家级代表性传承人。',
          '当代匠人群体坚守传统技艺同时数智技术赋能传承，3D扫描建档数字孪生展示AI辅助设计。',
          '千年技艺在云端焕发新生走向更广阔的世界，非遗保护与创新并重薪火相传。'
        ],
        images: [
          'assets/images/history/历史页UI元素参考/17.jpg',
          'assets/images/history/历史页UI元素参考/18.jpg',
          'assets/images/history/历史页UI元素参考/19.jpg',
          'assets/images/history/历史页UI元素参考/20.jpg'
        ],
        trivia: '2006年5月20日，潮州木雕经国务院批准列入第一批国家级非物质文化遗产名录，编号Ⅶ-41。',
        particle: '新'
      }
    ];
