package Thruk::Controller::editor;

use strict;
use warnings;
use Module::Load qw/load/;
use Digest::MD5 qw/md5_hex/;
use Encode qw/decode_utf8/;
use JSON::XS qw/decode_json/;
use File::Temp qw/tempfile/;
#use Thruk::Timer qw/timing_breakpoint/;

=head1 NAME

Thruk::Controller::editor - Thruk Controller

=head1 DESCRIPTION

Thruk Controller.

=head1 METHODS

=cut

##########################################################

=head2 index

=cut
sub index {
    my($c) = @_;

    return unless Thruk::Action::AddDefaults::add_defaults($c, Thruk::ADD_SAFE_DEFAULTS);

    $c->stash->{no_auto_reload}    = 1;
    $c->stash->{title}             = 'Editor';
    $c->stash->{page}              = 'config';
    $c->stash->{template}          = 'editor.tt';
    $c->stash->{subtitle}          = 'Editor';
    $c->stash->{infoBoxTitle}      = 'Editor';
    $c->stash->{disable_backspace} = 1;
    $c->stash->{no_tt_trim}        = 1;
    $c->stash->{has_jquery_ui}     = 1;
    $c->stash->{has_proc_inf}      = 0;

    my $edits = _normalize_config($c->config->{'editor'});

    my $action = $c->req->parameters->{'action'} || '';
    if($action eq 'get_file') {
        return unless Thruk::Utils::check_csrf($c);
        my $req_file = $c->req->parameters->{'file'};
        my $file = _get_file($edits, $req_file);
        if($file) {
            my $data = Thruk::Utils::IO::read($file);
            my $json = {data => decode_utf8($data), md5 => md5_hex($data) };
            return $c->render(json => $json);
        }
        $c->log->error("editor got request for unlisted file: ".$req_file);
        return $c->render(json => { data => "", "err" => "not allowed"});
    }
    elsif($action eq 'save_file') {
        return unless Thruk::Utils::check_csrf($c);
        my $req_file = $c->req->parameters->{'file'};
        my $file = _get_file($edits, $req_file);
        if($file) {
            my $data = $c->req->parameters->{'data'};
            Thruk::Utils::IO::write($file, $data);
            my $json = { md5 => md5_hex($data) };
            return $c->render(json => $json);
        }
        $c->log->error("editor got save request for unlisted file: ".$req_file);
        return $c->render(json => { data => "", "err" => "not allowed"});
    }
    elsif($action eq 'get_action_menu') {
        return unless Thruk::Utils::check_csrf($c);
        my $menus = $c->req->parameters->{'action_menu'};
        my $combined = [];
        for my $name (split/\,/mx, $menus) {
            my($err, $menu) = @{Thruk::Utils::Filter::get_action_menu($c, $name)};
            if(!$err) {
                push @{$combined}, @{decode_json($menu)};
            }
        }
        return $c->render(json => $combined);
    }
    elsif($c->req->parameters->{'serveraction'}) {
        return unless Thruk::Utils::check_csrf($c);
        my $req_file = $c->req->parameters->{'file'};
        my $file = _get_file($edits, $req_file);
        my($rc, $msg) = (1, "no such file or directory");
        if($file) {
            my($fh, $tmpfile) = tempfile();
            CORE::close($fh);
            Thruk::Utils::IO::write($tmpfile, $c->req->parameters->{'current_data'});
            ($rc, $msg) = Thruk::Utils::Status::serveraction($c, {'$FILENAME$' => $file, '$TMPFILENAME$' => $tmpfile});
            unlink($tmpfile);
        }
        my $json = { 'rc' => $rc, 'msg' => $msg };
        return $c->render(json => $json);
    } else {
        my $all_files = {};
        my $folders = [];
        for my $edit (@{$edits}) {
            my $folder = { name => $edit->{'name'} || '', 'dirs' => {}, 'files' => {} };
            my($data, $flat) = _get_files_and_folders($folder, $edit);
            push @{$folders}, $data;
            %{$all_files} = (%{$all_files}, %{$flat});
        }
        $c->stash->{files_tree} = $folders;
        $c->stash->{files_meta} = $all_files;
    }

    Thruk::Utils::ssi_include($c);

    return 1;
}

##########################################################
sub _get_files_and_folders {
    my($data, $edit) = @_;

    my $all_files = {};
    for my $file (@{$edit->{'files'}}) {
        for my $folder (@{$file->{'folder'}}) {
            for my $filter (@{$file->{'filter'}}) {
                my $files = Thruk::Utils::find_files($folder, $filter);
                for my $filename (@{$files}) {
                    $all_files->{$filename} = { syntax => $file->{'syntax'}, path => $folder, action => Thruk::Utils::list($file->{'action'}) };
                }
            }
        }
    }

    for my $file (sort keys %{$all_files}) {
        my $meta = $all_files->{$file};
        my $origpath = $file;
        $origpath =~ s|/[^/]+$||gmx;
        my $path = $meta->{'path'};
        $file =~ s/^\Q$path\E\///gmx;
        my @parts = split(/\//mx, $file);
        my $filename = pop @parts;
        my $cur = $data;
        while(my $dir = shift @parts) {
            if(!defined $cur->{'dirs'}->{$dir}) {
                $cur->{'dirs'}->{$dir} = { 'dirs' => {}, 'files' => {} };
            }
            $cur = $cur->{'dirs'}->{$dir};
        }
        $cur->{'files'}->{$filename} = { 'syntax' => $meta->{'syntax'} || '', path => $origpath, action => $meta->{'action'} };
    }
    return($data, $all_files);
}

##########################################################
sub _normalize_config {
    my($edits) = @_;
    if(!$edits) {
        return([]);
    }
    $edits = Thruk::Utils::list($edits);
    for my $edit (@{$edits}) {
        $edit->{'files'} = Thruk::Utils::list($edit->{'files'});
        for my $file (@{$edit->{'files'}}) {
            $file->{'folder'} = Thruk::Utils::list($file->{'folder'});
            ## no critic
            @{$file->{'folder'}} = map { $_ =~ s|\/$||gmx; $_; } @{$file->{'folder'}};
            ## use critic
            $file->{'filter'} = Thruk::Utils::list($file->{'filter'});
        }
    }
    return $edits;
}

##########################################################
sub _get_file {
    my($edits, $filename) = @_;
    for my $edit (@{$edits}) {
        for my $file (@{$edit->{'files'}}) {
            for my $folder (@{$file->{'folder'}}) {
                for my $filter (@{$file->{'filter'}}) {
                    my $files = Thruk::Utils::find_files($folder, $filter);
                    for my $file (@{$files}) {
                        if($file eq $filename) {
                            return($file);
                        }
                    }
                }
            }
        }
    }
    return;
}

##########################################################

=head1 AUTHOR

Sven Nierlein, 2009-present, <sven@nierlein.org>

=head1 LICENSE

This library is free software, you can redistribute it and/or modify
it under the same terms as Perl itself.

=cut

1;
