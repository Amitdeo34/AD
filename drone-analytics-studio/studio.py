#!/usr/bin/env python3
"""Drone Analytics Studio - start the local studio and open it in the browser.

    python studio.py                 # http://127.0.0.1:8765
    python studio.py --port 9000
    python studio.py --data D:\\DroneStudio   # where projects, cache and exports live
"""
import argparse
import os
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

if sys.version_info < (3, 9):
    sys.exit('Python 3.9 or newer is required.')


def main():
    ap = argparse.ArgumentParser(description='Drone Analytics Studio')
    ap.add_argument('--port', type=int, default=int(os.environ.get('DAS_PORT', 8765)))
    ap.add_argument('--host', default=os.environ.get('DAS_HOST', '127.0.0.1'),
                    help='use 0.0.0.0 to open the studio from other PCs on your network')
    ap.add_argument('--data', default=os.environ.get('DAS_DATA', os.path.join(HERE, 'workspace')))
    ap.add_argument('--no-browser', action='store_true')
    args = ap.parse_args()

    from engine import media
    from engine.server import serve, VERSION

    try:
        ff = media.ffmpeg_path()
    except RuntimeError as e:
        print('\n  !! ' + str(e) + '\n')
        ff = None

    httpd = None
    port = args.port
    for attempt in range(10):
        try:
            httpd = serve(args.data, args.host, port)
            break
        except OSError:
            port += 1
    if not httpd:
        sys.exit(f'Could not open a port near {args.port}.')

    url = f'http://{"127.0.0.1" if args.host in ("0.0.0.0", "") else args.host}:{port}/'
    print('')
    print('  ==============================================')
    print(f'   Drone Analytics Studio  v{VERSION}')
    print('  ==============================================')
    print(f'   Studio   : {url}')
    print(f'   Data     : {os.path.abspath(args.data)}')
    print(f'   FFmpeg   : {ff or "NOT FOUND"}')
    print('   Stop     : press Ctrl+C or close this window')
    print('')
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n  Bye!')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
