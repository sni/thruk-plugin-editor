use strict;
use warnings;
use Test::More;

BEGIN {
    my $tests = 12;
    plan tests => $tests;
}

BEGIN {
    use lib('t');
    require TestUtils;
    import TestUtils;
}


###########################################################
# test modules
if(defined $ENV{'PLACK_TEST_EXTERNALSERVER_URI'}) {
    unshift @INC, 'plugins/plugins-available/editor/lib';
}

SKIP: {
    skip 'external tests', 1 if defined $ENV{'PLACK_TEST_EXTERNALSERVER_URI'};

    use_ok 'Thruk::Controller::editor';
};

###########################################################
# test main page
TestUtils::test_page(
    'url'             => '/thruk/cgi-bin/editor.cgi',
    'like'            => 'Editor',
);
