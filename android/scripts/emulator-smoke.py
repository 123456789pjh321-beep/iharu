"""Isolated emulator smoke test: install, offline retry, rotation and repeated launcher entry."""
from pathlib import Path
import subprocess,time,re,xml.etree.ElementTree as ET
OUT=Path('android-smoke');OUT.mkdir(exist_ok=True)
def adb(*args):return subprocess.run(['adb',*args],capture_output=True,text=True,check=True).stdout
adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk')
adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
adb('logcat','-c');time.sleep(2)
def launch():
 result=adb('shell','am','start','-W','-n','com.myiharu.app/.MainActivity','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER')
 assert 'Error:' not in result,result
 time.sleep(1)
def nodes():
 adb('shell','uiautomator','dump','/sdcard/iharu-window.xml')
 xml=adb('shell','cat','/sdcard/iharu-window.xml')
 (OUT/'last-window.xml').write_text(xml)
 return ET.fromstring(xml)
def expect_offline():
 for attempt in range(6):
  if any(n.get('text')=='인터넷 연결을 확인해 주세요' for n in nodes().iter('node')):return
  time.sleep(1)
 raise AssertionError('Native offline screen missing; see last-window.xml and activity diagnostics')
def tap(text):
 n=next((n for n in nodes().iter('node') if n.get('text')==text),None)
 assert n is not None,'Missing native UI: '+text
 x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
 adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.5)
try:
 for i in range(12):
  launch();expect_offline()
  tap('다시 연결');expect_offline()
  if i==0:
   (OUT/'offline-native.png').write_bytes(subprocess.run(['adb','exec-out','screencap','-p'],capture_output=True,check=True).stdout)
  tap('닫기')
 launch();adb('shell','settings','put','system','accelerometer_rotation','0');adb('shell','settings','put','system','user_rotation','1');time.sleep(2)
 expect_offline()
finally:
 # Preserve actual UI and OS evidence even when an assertion fails.
 (OUT/'final-screen.png').write_bytes(subprocess.run(['adb','exec-out','screencap','-p'],capture_output=True,check=True).stdout)
 for name,args in [('logcat',('logcat','-d')),('activity',('shell','dumpsys','activity','activities')),('connectivity',('shell','dumpsys','connectivity'))]:
  (OUT/(name+'.txt')).write_text(adb(*args))
crashes=adb('logcat','-b','crash','-d');(OUT/'crash-log.txt').write_text(crashes)
assert 'com.myiharu.app' not in crashes,crashes
exit_info=adb('shell','dumpsys','activity','exit-info','com.myiharu.app')
(OUT/'exit-info.txt').write_text(exit_info)
assert not re.search(r'reason=\d+ \((?:CRASH|ANR|CRASH_NATIVE)\)',exit_info),exit_info
(OUT/'result.txt').write_text('PASS: 12 offline launch/retry/close cycles, rotation, no app crash or ANR in emulator logs.\nThis does not test Samsung firmware or a production authenticated browser session.\n')
print((OUT/'result.txt').read_text())
