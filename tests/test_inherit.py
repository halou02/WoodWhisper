import asyncio
import json
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

async def run_tests():
    results = {
        "page_load": {},
        "visual_layout": {},
        "interactions": {},
        "elements_exist": {},
        "scroll_test": {},
        "screenshots": []
    }
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="zh-CN"
        )
        page = await context.new_page()
        
        console_errors = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ["error", "warning"] else None)
        page.on("pageerror", lambda err: console_errors.append(f"[pageerror] {err}"))
        
        print("=" * 60)
        print("1. 页面加载测试")
        print("=" * 60)
        
        try:
            await page.goto("http://localhost:8124/inherit.html", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)
            results["page_load"]["status"] = "PASS"
            results["page_load"]["message"] = "页面正常加载"
            await page.screenshot(path="test_screenshots/01_initial_load.png", full_page=False)
            results["screenshots"].append("01_initial_load.png")
            print("✓ 页面正常加载")
        except Exception as e:
            results["page_load"]["status"] = "FAIL"
            results["page_load"]["message"] = str(e)
            print(f"✗ 页面加载失败: {e}")
        
        if console_errors:
            results["page_load"]["console_errors"] = console_errors
            print(f"⚠ 控制台警告/错误: {console_errors}")
        else:
            results["page_load"]["console_errors"] = []
            print("✓ 控制台无错误")
        
        await asyncio.sleep(1)
        
        print("\n" + "=" * 60)
        print("2. 视觉布局验证")
        print("=" * 60)
        
        try:
            bg = await page.evaluate('''() => {
                const el = document.querySelector('.inherit-page');
                const style = window.getComputedStyle(el);
                return {
                    hasBg: style.backgroundImage !== 'none',
                    bgColor: style.backgroundColor,
                    darkMode: el.classList.contains('dark')
                };
            }''')
            if bg['hasBg'] and bg['darkMode']:
                results["visual_layout"]["background"] = "PASS"
                print("✓ 深色背景+背景图已加载")
            else:
                results["visual_layout"]["background"] = "FAIL"
                print(f"✗ 背景问题: {bg}")
        except Exception as e:
            results["visual_layout"]["background"] = f"FAIL: {e}"
        
        try:
            title = await page.locator('.inherit-title').inner_text()
            subtitle = await page.locator('.inherit-subtitle').inner_text()
            title_visible = await page.locator('.inherit-title').is_visible()
            subtitle_visible = await page.locator('.inherit-subtitle').is_visible()
            if title == "传承" and subtitle == "以刀刻木，以心守艺" and title_visible and subtitle_visible:
                results["visual_layout"]["titles"] = "PASS"
                print(f"✓ 标题'{title}'和副标题'{subtitle}'可见")
            else:
                results["visual_layout"]["titles"] = "FAIL"
                print(f"✗ 标题问题: title={title}, subtitle={subtitle}, visible={title_visible}/{subtitle_visible}")
        except Exception as e:
            results["visual_layout"]["titles"] = f"FAIL: {e}"
        
        try:
            await page.wait_for_timeout(1000)
            featured_card = await page.query_selector('.inherit-card--featured')
            if featured_card:
                featured_transform = await featured_card.evaluate('el => window.getComputedStyle(el).transform')
                featured_scale = await featured_card.evaluate('el => { const t = el.getBoundingClientRect(); return {width: t.width, height: t.height, top: t.top}; }')
                other_cards = await page.query_selector_all('.inherit-card:not(.inherit-card--featured)')
                if other_cards:
                    other_transform = await other_cards[0].evaluate('el => window.getComputedStyle(el).transform')
                    other_scale = await other_cards[0].evaluate('el => { const t = el.getBoundingClientRect(); return {width: t.width, height: t.height, top: t.top}; }')
                    featured_brighter = await featured_card.evaluate('el => parseFloat(window.getComputedStyle(el).filter.match(/brightness\\(([^)]+)\\)/)?.[1] || "1")')
                    other_brighter = await other_cards[0].evaluate('el => parseFloat(window.getComputedStyle(el).filter.match(/brightness\\(([^)]+)\\)/)?.[1] || "1")')
                    
                    if featured_scale['width'] > other_scale['width'] and featured_brighter > other_brighter and featured_scale['top'] > other_scale['top']:
                        results["visual_layout"]["card_layout"] = "PASS"
                        print(f"✓ 卡片错落效果正常: 焦点卡片更大({featured_scale['width']:.0f}px vs {other_scale['width']:.0f}px)、更亮({featured_brighter} vs {other_brighter})、位置更低")
                    else:
                        results["visual_layout"]["card_layout"] = "PARTIAL"
                        print(f"⚠ 卡片错落: 焦点尺寸{featured_scale['width']:.0f}px, 其他{other_scale['width']:.0f}px; 亮度{featured_brighter}/{other_brighter}; top{featured_scale['top']:.0f}/{other_scale['top']:.0f}")
                else:
                    results["visual_layout"]["card_layout"] = "FAIL: 未找到非焦点卡片"
            else:
                results["visual_layout"]["card_layout"] = "FAIL: 未找到焦点卡片(.inherit-card--featured)"
        except Exception as e:
            results["visual_layout"]["card_layout"] = f"FAIL: {e}"
            print(f"✗ 卡片布局检查失败: {e}")
        
        await page.screenshot(path="test_screenshots/02_cards_layout.png")
        results["screenshots"].append("02_cards_layout.png")
        
        try:
            start_label = page.locator('.inherit-label--start')
            start_pos = await start_label.evaluate('el => { const r = el.getBoundingClientRect(); return {top: r.top, left: r.left, visible: el.offsetParent !== null}; }')
            start_text = await start_label.inner_text()
            if start_text == "初学" and start_pos['visible'] and start_pos['left'] < 720:
                results["visual_layout"]["label_start"] = "PASS"
                print(f"✓ '初学'标注可见，位于卡片上方偏左位置")
            else:
                results["visual_layout"]["label_start"] = f"PARTIAL: text={start_text}, pos={start_pos}"
                print(f"⚠ '初学'标注: text={start_text}, pos={start_pos}")
        except Exception as e:
            results["visual_layout"]["label_start"] = f"FAIL: {e}"
        
        try:
            gold_line = page.locator('.inherit-gold-line')
            line_pos = await gold_line.evaluate('el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return {left: r.left, width: r.width, bg: s.backgroundImage, visible: el.offsetParent !== null, height: r.height}; }')
            is_centered = abs(line_pos['left'] - 720) < 5
            has_gradient = 'linear-gradient' in line_pos['bg'] and 'transparent' in line_pos['bg']
            if line_pos['visible'] and is_centered and line_pos['width'] <= 2 and has_gradient:
                results["visual_layout"]["gold_line"] = "PASS"
                print(f"✓ 金色竖线居中、细(1px)、两端渐变")
            else:
                results["visual_layout"]["gold_line"] = f"PARTIAL: centered={is_centered}, gradient={has_gradient}, width={line_pos['width']}"
                print(f"⚠ 金色竖线: 居中={is_centered}, 渐变={has_gradient}, 宽度={line_pos['width']}px")
        except Exception as e:
            results["visual_layout"]["gold_line"] = f"FAIL: {e}"
        
        try:
            end_label = page.locator('.inherit-label--end')
            end_pos = await end_label.evaluate('el => { const r = el.getBoundingClientRect(); return {left: r.left, visible: el.offsetParent !== null, top: r.top}; }')
            end_text = await end_label.inner_text()
            is_centered = abs(end_pos['left'] + 20 - 720) < 50
            if end_text == "承艺" and end_pos['visible'] and is_centered:
                results["visual_layout"]["label_end"] = "PASS"
                print(f"✓ '承艺'标注可见，居中位于按钮上方")
            else:
                results["visual_layout"]["label_end"] = f"PARTIAL: text={end_text}, centered={is_centered}"
        except Exception as e:
            results["visual_layout"]["label_end"] = f"FAIL: {e}"
        
        try:
            btns = await page.query_selector_all('.inherit-action-btn')
            btn_styles = []
            for btn in btns:
                style = await btn.evaluate('el => { const s = window.getComputedStyle(el); return {bg: s.backgroundColor, border: s.borderColor, color: s.color, text: el.innerText}; }')
                btn_styles.append(style)
            if len(btns) == 2:
                btn1_ok = btn_styles[0]['bg'] != 'rgba(0, 0, 0, 0)' and 'rgb(' in btn_styles[0]['bg']
                results["visual_layout"]["buttons"] = "PASS" if btn1_ok else "PARTIAL"
                print(f"✓ 两个按钮存在: '{btn_styles[0]['text']}'和'{btn_styles[1]['text']}'")
                print(f"  按钮1: bg={btn_styles[0]['bg']}, border={btn_styles[0]['border']}, text={btn_styles[0]['color']}")
            else:
                results["visual_layout"]["buttons"] = f"FAIL: 找到{len(btns)}个按钮"
        except Exception as e:
            results["visual_layout"]["buttons"] = f"FAIL: {e}"
        
        try:
            nav = page.locator('.bottom-nav')
            nav_visible = await nav.is_visible()
            active_item = page.locator('.bottom-nav__item--active')
            active_text = await active_item.inner_text() if await active_item.count() > 0 else ""
            if nav_visible and "传承" in active_text:
                results["visual_layout"]["bottom_nav"] = "PASS"
                print(f"✓ 底部导航正常显示，'传承'为激活项")
            else:
                results["visual_layout"]["bottom_nav"] = f"PARTIAL: visible={nav_visible}, active={active_text}"
        except Exception as e:
            results["visual_layout"]["bottom_nav"] = f"FAIL: {e}"
        
        await page.screenshot(path="test_screenshots/03_layout_detail.png")
        results["screenshots"].append("03_layout_detail.png")
        
        print("\n" + "=" * 60)
        print("3. 交互功能测试")
        print("=" * 60)
        
        try:
            moon_btn = page.locator('#darkModeBtn')
            initial_dark = await page.evaluate('() => document.getElementById("inheritPage").classList.contains("dark")')
            
            await moon_btn.click()
            await page.wait_for_timeout(500)
            after_light = await page.evaluate('() => document.getElementById("inheritPage").classList.contains("dark")')
            
            await moon_btn.click()
            await page.wait_for_timeout(500)
            after_dark_again = await page.evaluate('() => document.getElementById("inheritPage").classList.contains("dark")')
            
            await page.screenshot(path="test_screenshots/04_light_mode.png")
            results["screenshots"].append("04_light_mode.png")
            
            if initial_dark and not after_light and after_dark_again:
                results["interactions"]["dark_mode_toggle"] = "PASS"
                print("✓ 明暗模式切换正常: 深色→浅色→深色")
            else:
                results["interactions"]["dark_mode_toggle"] = f"FAIL: initial={initial_dark}, light={after_light}, dark={after_dark_again}"
                print(f"✗ 明暗切换问题: initial={initial_dark}, light={after_light}, dark={after_dark_again}")
        except Exception as e:
            results["interactions"]["dark_mode_toggle"] = f"FAIL: {e}"
            print(f"✗ 明暗模式测试失败: {e}")
        
        await page.wait_for_timeout(300)
        
        try:
            scroll_container = page.locator('#cardsScroll')
            initial_featured = await page.evaluate('''() => {
                const featured = document.querySelector('.inherit-card--featured');
                return featured ? featured.getAttribute('data-index') : null;
            }''')
            
            box = await scroll_container.bounding_box()
            if box:
                await page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
                await page.mouse.down()
                await page.mouse.move(box['x'] - 100, box['y'] + box['height']/2, steps=20)
                await page.mouse.up()
                await page.wait_for_timeout(800)
                
                after_scroll_featured = await page.evaluate('''() => {
                    const featured = document.querySelector('.inherit-card--featured');
                    return featured ? featured.getAttribute('data-index') : null;
                }''')
                
                await page.screenshot(path="test_screenshots/05_after_scroll.png")
                results["screenshots"].append("05_after_scroll.png")
                
                if initial_featured != after_scroll_featured and after_scroll_featured is not None:
                    results["interactions"]["card_scroll"] = "PASS"
                    print(f"✓ 横向滑动卡片正常，焦点卡片自动切换: {initial_featured} → {after_scroll_featured}")
                else:
                    results["interactions"]["card_scroll"] = f"PARTIAL: from={initial_featured}, to={after_scroll_featured}"
                    print(f"⚠ 卡片滑动: 初始={initial_featured}, 滑动后={after_scroll_featured}")
            else:
                await scroll_container.evaluate('el => el.scrollBy({left: 200, behavior: "smooth"})')
                await page.wait_for_timeout(800)
                after_scroll_featured = await page.evaluate('''() => {
                    const featured = document.querySelector('.inherit-card--featured');
                    return featured ? featured.getAttribute('data-index') : null;
                }''')
                if initial_featured != after_scroll_featured:
                    results["interactions"]["card_scroll"] = "PASS"
                    print(f"✓ 卡片滚动切换焦点正常")
                else:
                    results["interactions"]["card_scroll"] = "PARTIAL"
        except Exception as e:
            results["interactions"]["card_scroll"] = f"FAIL: {e}"
            print(f"✗ 卡片滑动测试失败: {e}")
        
        try:
            await page.evaluate('''() => {
                const defaultCard = document.querySelector('.inherit-card[data-index="2"]');
                if (defaultCard) defaultCard.scrollIntoView({inline: 'center', block: 'nearest'});
            }''')
            await page.wait_for_timeout(600)
            
            first_card = page.locator('.inherit-card--featured')
            if await first_card.count() == 0:
                first_card = page.locator('.inherit-card').first
            await first_card.click()
            await page.wait_for_timeout(500)
            
            modal_visible = await page.locator('#masterModal').evaluate('el => el.classList.contains("inherit-modal--open")')
            await page.screenshot(path="test_screenshots/06_card_modal.png")
            results["screenshots"].append("06_card_modal.png")
            
            if modal_visible:
                results["interactions"]["card_click_modal"] = "PASS"
                print("✓ 点击卡片弹出详情弹窗")
                
                close_btn = page.locator('#modalClose')
                await close_btn.click()
                await page.wait_for_timeout(300)
                modal_closed = not await page.locator('#masterModal').evaluate('el => el.classList.contains("inherit-modal--open")')
                if modal_closed:
                    print("✓ 弹窗可正常关闭")
            else:
                results["interactions"]["card_click_modal"] = "FAIL"
                print("✗ 点击卡片未弹出弹窗")
        except Exception as e:
            results["interactions"]["card_click_modal"] = f"FAIL: {e}"
            print(f"✗ 卡片点击弹窗测试失败: {e}")
        
        try:
            btn1 = page.locator('#btnViewMasters')
            btn1_visible = await btn1.is_visible()
            await btn1.click()
            await page.wait_for_timeout(500)
            results["interactions"]["btn_view_masters"] = "PASS (按钮可点击)" if btn1_visible else "FAIL"
            print(f"✓ '查看大师心迹'按钮存在且可点击 (visible={btn1_visible})")
        except Exception as e:
            results["interactions"]["btn_view_masters"] = f"FAIL: {e}"
        
        try:
            btn2 = page.locator('#btnMyPersistence')
            await btn2.click()
            await page.wait_for_timeout(500)
            
            ring_modal_visible = await page.locator('#ringModal').evaluate('el => el.classList.contains("inherit-ring-modal--open")')
            await page.screenshot(path="test_screenshots/07_ring_modal.png")
            results["screenshots"].append("07_ring_modal.png")
            
            if ring_modal_visible:
                results["interactions"]["btn_my_persistence"] = "PASS"
                print("✓ '刻下我的坚持'按钮点击后弹出年轮弹窗")
                
                ring_close = page.locator('#ringClose')
                await ring_close.click()
                await page.wait_for_timeout(300)
            else:
                results["interactions"]["btn_my_persistence"] = "PARTIAL: 按钮可点击但未检测到弹窗"
                print("⚠ '刻下我的坚持'按钮可点击，但未检测到年轮弹窗打开")
        except Exception as e:
            results["interactions"]["btn_my_persistence"] = f"FAIL: {e}"
            print(f"✗ '刻下我的坚持'按钮测试失败: {e}")
        
        print("\n" + "=" * 60)
        print("4. 元素存在性检查")
        print("=" * 60)
        
        labels_to_check = ["初学", "经年", "承艺"]
        all_labels_exist = True
        for label in labels_to_check:
            try:
                loc = page.locator(f'.inherit-label:has-text("{label}")')
                exists = await loc.count() > 0
                visible = await loc.is_visible() if exists else False
                if exists and visible:
                    results["elements_exist"][label] = "PASS"
                    print(f"✓ '{label}'标注存在且可见")
                else:
                    results["elements_exist"][label] = f"FAIL: exists={exists}, visible={visible}"
                    print(f"✗ '{label}'标注问题: exists={exists}, visible={visible}")
                    all_labels_exist = False
            except Exception as e:
                results["elements_exist"][label] = f"FAIL: {e}"
                all_labels_exist = False
        
        print("\n" + "=" * 60)
        print("5. 滚动测试")
        print("=" * 60)
        
        try:
            initial_scroll = await page.evaluate('() => window.scrollY')
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await page.wait_for_timeout(500)
            after_scroll = await page.evaluate('() => window.scrollY')
            
            has_horizontal_scroll = await page.evaluate('''() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            }''')
            
            await page.screenshot(path="test_screenshots/08_scrolled_bottom.png", full_page=False)
            results["screenshots"].append("08_scrolled_bottom.png")
            
            if after_scroll > initial_scroll:
                results["scroll_test"]["vertical_scroll"] = "PASS"
                print(f"✓ 页面可正常向下滚动 (from {initial_scroll} to {after_scroll})")
            else:
                results["scroll_test"]["vertical_scroll"] = "PARTIAL"
            
            if not has_horizontal_scroll:
                results["scroll_test"]["no_horizontal_scroll"] = "PASS"
                print("✓ 无横向滚动条")
            else:
                results["scroll_test"]["no_horizontal_scroll"] = "FAIL"
                print("✗ 存在横向滚动条")
            
            nav_still_visible = await page.locator('.bottom-nav').is_visible()
            if nav_still_visible:
                results["scroll_test"]["bottom_nav_sticky"] = "PASS"
                print("✓ 底部导航在滚动后仍然可见")
            else:
                results["scroll_test"]["bottom_nav_sticky"] = "PARTIAL"
        except Exception as e:
            results["scroll_test"]["error"] = str(e)
            print(f"✗ 滚动测试失败: {e}")
        
        await page.wait_for_timeout(500)
        await page.screenshot(path="test_screenshots/09_final.png", full_page=True)
        results["screenshots"].append("09_final.png")
        
        await browser.close()
        
        print("\n" + "=" * 60)
        print("测试完成！截图保存在 test_screenshots/ 目录")
        print("=" * 60)
        
        return results

if __name__ == "__main__":
    import os
    os.makedirs("test_screenshots", exist_ok=True)
    results = asyncio.run(run_tests())
    
    print("\n" + "=" * 60)
    print("验证结果汇总")
    print("=" * 60)
    
    def print_section(name, data):
        print(f"\n【{name}】")
        for k, v in data.items():
            if k == "screenshots":
                continue
            status = "✓" if str(v).startswith("PASS") else "⚠" if str(v).startswith("PARTIAL") else "✗"
            print(f"  {status} {k}: {v}")
    
    print_section("页面加载", results["page_load"])
    print_section("视觉布局", results["visual_layout"])
    print_section("交互功能", results["interactions"])
    print_section("元素存在", results["elements_exist"])
    print_section("滚动测试", results["scroll_test"])
    
    print(f"\n截图文件: {results['screenshots']}")
    
    with open("test_screenshots/test_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
