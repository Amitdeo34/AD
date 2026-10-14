"""Project storage: one folder per project with project.json and its exports."""
import json
import os
import re
import shutil
import threading
import time
import uuid


class Store:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.projects_dir = os.path.join(self.root, 'projects')
        self.cache_dir = os.path.join(self.root, 'cache')
        for d in (self.projects_dir, self.cache_dir):
            os.makedirs(d, exist_ok=True)
        self.lock = threading.Lock()

    def _dir(self, pid):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', pid or ''):
            raise KeyError('bad project id')
        return os.path.join(self.projects_dir, pid)

    def _file(self, pid):
        return os.path.join(self._dir(pid), 'project.json')

    def list(self):
        out = []
        for pid in sorted(os.listdir(self.projects_dir)):
            f = os.path.join(self.projects_dir, pid, 'project.json')
            if not os.path.isfile(f):
                continue
            try:
                with open(f, encoding='utf-8') as fh:
                    p = json.load(fh)
            except (OSError, ValueError):
                continue
            info = p.get('info', {})
            out.append({'id': pid, 'name': info.get('name') or pid, 'site': info.get('site', ''),
                        'surveyLabel': info.get('surveyLabel', ''), 'surveyDate': info.get('surveyDate', ''),
                        'mediaDir': p.get('mediaDir', ''), 'updated': os.path.getmtime(f),
                        'scenes': len(p.get('scenes', []))})
        out.sort(key=lambda x: -x['updated'])
        return out

    def create(self, project):
        name = (project.get('info', {}).get('name') or 'project').strip()
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:40] or 'project'
        pid = f'{slug}-{uuid.uuid4().hex[:6]}'
        os.makedirs(self._dir(pid), exist_ok=True)
        project['id'] = pid
        project.setdefault('created', time.strftime('%Y-%m-%d %H:%M'))
        self.save(pid, project)
        return project

    def load(self, pid):
        with open(self._file(pid), encoding='utf-8') as fh:
            p = json.load(fh)
        p['id'] = pid
        return p

    def save(self, pid, project):
        project['id'] = pid
        f = self._file(pid)
        tmp = f + '.tmp'
        with self.lock:
            with open(tmp, 'w', encoding='utf-8') as fh:
                json.dump(project, fh, ensure_ascii=False, indent=1)
            os.replace(tmp, f)
            # rolling backups so a bad edit is never fatal
            bdir = os.path.join(self._dir(pid), 'backups')
            os.makedirs(bdir, exist_ok=True)
            stamp = time.strftime('%Y%m%d-%H%M')
            shutil.copyfile(f, os.path.join(bdir, f'project-{stamp}.json'))
            backups = sorted(os.listdir(bdir))
            for old in backups[:-30]:
                try:
                    os.remove(os.path.join(bdir, old))
                except OSError:
                    pass

    def delete(self, pid):
        shutil.rmtree(self._dir(pid), ignore_errors=True)

    def media_dir(self, pid):
        d = self.load(pid).get('mediaDir') or ''
        return os.path.abspath(os.path.expanduser(d)) if d else ''

    def exports_dir(self, pid):
        p = self.load(pid)
        d = (p.get('exportDir') or '').strip()
        d = os.path.abspath(os.path.expanduser(d)) if d else os.path.join(self._dir(pid), 'exports')
        os.makedirs(d, exist_ok=True)
        return d

    def jobs_dir(self):
        d = os.path.join(self.cache_dir, 'jobs')
        os.makedirs(d, exist_ok=True)
        return d
