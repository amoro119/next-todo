#!/usr/bin/env python3
"""Toggle DSH's built-in todo plugin without replacing other preset settings."""
import argparse
import copy
import datetime
import os
from pathlib import Path
import shutil
import tempfile
import yaml

class Expression(str):
    pass
class Loader(yaml.SafeLoader):
    pass
class Dumper(yaml.SafeDumper):
    pass
Loader.add_constructor('tag:yaml.org,2002:js', lambda loader, node: Expression(loader.construct_scalar(node)))
Dumper.add_representer(Expression, lambda dumper, value: dumper.represent_scalar('tag:yaml.org,2002:js', str(value)))

def read_rows(path):
    rows = yaml.load(path.read_text(), Loader=Loader) or []
    if not isinstance(rows, list):
        raise ValueError(f'{path}: expected a YAML entry list')
    return rows

def rows_with_ids(rows):
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Every patch entry must be a mapping')
        if 'id' in row:
            yield row
        if isinstance(row.get('insert'), list):
            yield from rows_with_ids(row['insert'])

def todo_rows(plugins):
    for row in plugins:
        if row.get('name') == '@deepseek-ai/dsh-tool-todo' or row.get('id') == 'tool-todo':
            yield row
        if row.get('group') and isinstance(row.get('config'), list):
            yield from todo_rows(row['config'])

def configure(profile, sources, action):
    patch = profile / 'cordis.patch.yml'
    original = patch.read_text() if patch.exists() else ''
    rows = read_rows(patch) if patch.exists() else []
    overrides = list(rows_with_ids(rows))
    changed = False
    result = []
    # A preset config is a whole replacement in the Cordis patch dialect.
    # Start with the current override, when present, to retain custom plugins.
    for filename in ['standard.patch.yml', 'cordis.patch.yml', 'ptc.patch.yml']:
        for base in rows_with_ids(read_rows(sources / filename)):
            if base.get('name') != '@deepseek-ai/dsh-agent-preset':
                continue
            matches = [row for row in overrides if row.get('id') == base['id']]
            effective = copy.deepcopy(base['config'])
            for row in matches:
                if 'config' in row:
                    effective = copy.deepcopy(row['config'])
            if not isinstance(effective, dict) or not isinstance(effective.get('plugins'), list):
                raise ValueError(f"Cannot safely edit preset {base['id']}: plugins must be a literal list")
            targets = list(todo_rows(effective['plugins']))
            if not targets:
                result.append((base['id'], 'absent'))
                continue
            if action != 'status':
                disabled = action == 'disable'
                if any(row.get('disabled', False) is not disabled for row in targets):
                    for row in targets:
                        row['disabled'] = disabled
                    if matches:
                        matches[-1]['config'] = effective
                    else:
                        rows.append({'id': base['id'], 'config': effective})
                    changed = True
            result.append((base['id'], ['disabled' if row.get('disabled') is True else 'enabled' for row in targets]))
    if changed:
        rendered = yaml.dump(rows, Dumper=Dumper, allow_unicode=True, sort_keys=False, width=120)
        # Validate before touching the live file; retain !!js as expressions.
        assert yaml.load(rendered, Loader=Loader) == rows
        profile.mkdir(parents=True, exist_ok=True)
        backup_dir = profile / '.next-todo-backups'
        backup_dir.mkdir(mode=0o700, exist_ok=True)
        backup = backup_dir / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.yml')
        fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out:
            out.write(original)
        fd, temp = tempfile.mkstemp(prefix='.next-todo-patch-', dir=profile)
        try:
            with os.fdopen(fd, 'w') as out:
                out.write('# Profile overrides; next-todo manages only tool-todo disabled flags in presets.\n' + rendered)
            os.replace(temp, patch)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
        print(f'Updated {patch}; backup: {backup}')
    else:
        print('No configuration changes needed.')
    for name, state in result:
        print(f'{name}: {state}')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'disable', 'enable'])
    parser.add_argument('--profile-dir', type=Path, required=True)
    parser.add_argument('--preset-source-dir', type=Path, required=True,
                        help='presets directory in the installed @deepseek-ai/dsh-web-app package')
    args = parser.parse_args()
    configure(args.profile_dir.resolve(), args.preset_source_dir.resolve(), args.action)
